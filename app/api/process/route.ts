import { NextRequest } from "next/server";
import { parseDailyWorkbook } from "@/lib/parseDaily";
import { parseWeeklyWorkbook } from "@/lib/parseWeekly";
import {
  buildColumn,
  dayDataToAgg,
  emptyDayAgg,
  makeDateRange,
  chunkDatesIntoWeeks,
  weekRangeLabel,
} from "@/lib/aggregate";
import { buildWorkbookFile } from "@/lib/buildWorkbook";
import { DayAgg, ColumnAgg } from "@/lib/types";

export const runtime = "nodejs";

/** Парсит "YYYY-MM-DD" (значение <input type=date>) как локальную дату, без сдвига по UTC */
function parseIsoDateLocal(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function keyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("files") as File[];
    const startStr = String(form.get("start") || "");
    const endStr = String(form.get("end") || "");
    const modeParam = String(form.get("mode") || "auto"); // 'auto' | 'days' | 'weeks'

    if (!files.length) {
      return new Response(
        JSON.stringify({ error: "Не переданы файлы" }),
        { status: 400 }
      );
    }
    if (!startStr || !endStr) {
      return new Response(
        JSON.stringify({ error: "Не указан период (start/end)" }),
        { status: 400 }
      );
    }

    const start = parseIsoDateLocal(startStr);
    const end = parseIsoDateLocal(endStr);
    if (!start || !end || start > end) {
      return new Response(
        JSON.stringify({ error: "Некорректный период дат" }),
        { status: 400 }
      );
    }

    const daysByKey = new Map<string, DayAgg>();
    const parseWarnings: string[] = [];

    function addDay(day: DayAgg, fileName: string) {
      if (daysByKey.has(day.dateKey)) {
        parseWarnings.push(
          `Дата ${day.dateKey} встречается в нескольких файлах — использован файл "${fileName}"`
        );
      }
      daysByKey.set(day.dateKey, day);
    }

    for (const file of files) {
      const buf = await file.arrayBuffer();

      // Сначала пробуем как дневной файл (таблица пациентов + дата в шапке/имени)
      const daily = parseDailyWorkbook(buf, file.name);
      if (daily) {
        if (daily.warnings.length) parseWarnings.push(...daily.warnings);
        addDay(dayDataToAgg(daily), file.name);
        continue;
      }

      // Иначе пробуем как недельную сводку (колонки B..H = дни)
      const weekly = parseWeeklyWorkbook(buf, file.name);
      if (weekly) {
        if (weekly.warnings.length) parseWarnings.push(...weekly.warnings);
        for (const d of weekly.days) addDay(d, file.name);
        continue;
      }

      parseWarnings.push(
        `Файл "${file.name}" не удалось разобрать ни как дневной, ни как недельный`
      );
    }

    const allDates = makeDateRange(start, end);
    const resolvedDays: DayAgg[] = allDates.map((d) => {
      const key = keyOf(d);
      const found = daysByKey.get(key);
      if (!found) {
        parseWarnings.push(`Нет данных за ${fmtDdMmYyyy(d)} — учтено как 0`);
        return emptyDayAgg(d, key);
      }
      return found;
    });

    const mode: "days" | "weeks" =
      modeParam === "days" || modeParam === "weeks"
        ? modeParam
        : allDates.length <= 7
        ? "days"
        : "weeks";

    let columns: ColumnAgg[];
    if (mode === "days") {
      columns = resolvedDays.map((d) => buildColumn([d], fmtDdMmYyyy(d.date)));
    } else {
      const weeks = chunkDatesIntoWeeks(allDates);
      columns = weeks.map((weekDates) => {
        const weekDays = weekDates.map((d) => {
          const key = keyOf(d);
          return daysByKey.get(key) || emptyDayAgg(d, key);
        });
        return buildColumn(weekDays, "Всего", weekRangeLabel(weekDates));
      });
    }

    const fileBuffer = buildWorkbookFile(columns, mode);

    const label =
      mode === "days"
        ? `${fmtDdMmYyyy(start)}-${fmtDdMmYyyy(end)}`
        : `${fmtDdMmYyyy(start)}-${fmtDdMmYyyy(end)}_mesyats`;
    const asciiFilename = `Svodka_${label}.xlsx`;
    const displayFilename = `Свод_${
      mode === "days"
        ? `${fmtDdMmYyyy(start)}-${fmtDdMmYyyy(end)}`
        : `${fmtDdMmYyyy(start)}-${fmtDdMmYyyy(end)}_месяц`
    }.xlsx`;

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        // HTTP-заголовки должны быть ASCII: даём безопасное имя (filename) +
        // корректное кириллическое имя для браузеров, которые его поддерживают (filename*)
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(
          displayFilename
        )}`,
        "X-Warnings": encodeURIComponent(JSON.stringify(parseWarnings)),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
