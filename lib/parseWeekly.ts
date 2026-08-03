import * as XLSX from "xlsx";
import { DayAgg, GroupStats } from "./types";
import { emptyStats } from "./aggregate";

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(",", ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = parseFloat(m[0]);
  return isNaN(n) ? 0 : n;
}

function parseHeaderCellDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = toStr(v);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function findRow(rows: unknown[][], label: string): number {
  for (let i = 0; i < rows.length; i++) {
    if (toStr((rows[i] || [])[0]) === label) return i;
  }
  return -1;
}

function readGroupStats(
  rows: unknown[][],
  startRow: number,
  col: number
): GroupStats {
  const s = emptyStats();
  const at = (offset: number) => toNum((rows[startRow + offset] || [])[col]);
  s.total = at(0);
  s.ii = at(1);
  s.gt = at(2);
  s.do45 = at(3);
  s.giDo45 = at(4);
  s.nihssLt4 = at(5);
  s.nihss5to20 = at(6);
  s.nihssGt20 = at(7);
  s.ageLt45 = at(8);
  s.ageLe60 = at(9);
  s.ageGt60 = at(10);

  const rawTlt = (rows[startRow + 11] || [])[col];
  if (typeof rawTlt === "number") {
    s.tltTeCount = rawTlt;
    s.tltTeLabel = "";
  } else {
    const str = toStr(rawTlt);
    const m = str.match(/\d+/);
    s.tltTeCount = m ? Number(m[0]) : 0;
    s.tltTeLabel = str && str !== "0" ? str : "";
  }
  return s;
}

/**
 * Пытается разобрать файл как НЕДЕЛЬНУЮ сводку (колонки B..H = дни, как в
 * "Сводная_ДД_ММ-ДД_ММ.xlsx"). Возвращает null, если файл не похож на такой
 * (нет ни одной распознанной даты в первой строке или не найдены нужные строки-метки).
 */
export function parseWeeklyWorkbook(
  buffer: ArrayBuffer,
  sourceFileName: string
): { days: DayAgg[]; warnings: string[] } | null {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const header = rows[0] || [];
  const dateCols: { col: number; date: Date }[] = [];
  for (let col = 1; col < header.length; col++) {
    const d = parseHeaderCellDate(header[col]);
    if (!d) break;
    dateCols.push({ col, date: d });
  }
  if (dateCols.length === 0) return null; // не похоже на недельный формат

  const rIncoming = findRow(rows, "Входящие");
  const rConfirmed = findRow(rows, "Подтвержденные");
  const rTransfers = findRow(rows, "Переводы");
  const rAmbulatory = findRow(rows, "Амбулаторно");
  const rInHospital = findRow(rows, "Внутригоспитальные");
  const rOtherDiag = findRow(rows, "Другие дз");
  const r3 = findRow(rows, "ОРИТ3");
  const r10 = findRow(rows, "ОРИТ10");

  if (
    [
      rIncoming,
      rConfirmed,
      rTransfers,
      rAmbulatory,
      rInHospital,
      rOtherDiag,
      r3,
      r10,
    ].some((r) => r === -1)
  ) {
    return null; // структура не совпадает с ожидаемой — не считаем недельным файлом
  }

  const warnings: string[] = [
    `Файл "${sourceFileName}" распознан как недельная сводка — значения ТЛТ/ТЭ по дням могут быть приблизительными (взяты из уже сведённого текста).`,
  ];

  const days: DayAgg[] = dateCols.map(({ col, date }) => ({
    dateKey: dateKeyOf(date),
    date,
    incoming: toNum((rows[rIncoming] || [])[col]),
    confirmed: toNum((rows[rConfirmed] || [])[col]),
    transfers: toNum((rows[rTransfers] || [])[col]),
    ambulatory: toNum((rows[rAmbulatory] || [])[col]),
    inHospital: toNum((rows[rInHospital] || [])[col]),
    otherDiagnosis: toNum((rows[rOtherDiag] || [])[col]),
    orit3: readGroupStats(rows, r3, col),
    orit10: readGroupStats(rows, r10, col),
    source: "weekly" as const,
    warnings: [],
  }));

  return { days, warnings };
}
