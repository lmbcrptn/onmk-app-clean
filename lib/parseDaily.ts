import * as XLSX from "xlsx";
import { DayData, Patient, OritGroup, Window, StrokeType } from "./types";

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Достаёт дату dd.mm.yyyy из произвольного текста ячейки B2 */
function parseHeaderDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = toStr(v);
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Запасной вариант: достаёт дату из имени файла (напр. "16_06_2026г_.xlsx"), если в шапке дата не заполнена */
function parseDateFromFilename(name: string): Date | null {
  const m = name.match(/(\d{1,2})[._](\d{1,2})[._](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Определяет группу ОРИТ по тексту "Место госпитализации" */
function detectOrit(place: string): OritGroup {
  const m = place.match(/(\d+)/);
  if (!m) return "other";
  if (m[1] === "3") return "ОРИТ3";
  if (m[1] === "10") return "ОРИТ10";
  return "other";
}

function detectType(raw: unknown): StrokeType {
  const s = toStr(raw);
  const m = s.match(/^(\d)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 1 ? 1 : n === 2 ? 2 : null;
}

function detectWindow(row: unknown[]): Window {
  // индексы 4,5,6 = "до 4,5" / "4,5-24 ч." / "> 24 ч."
  if (toStr(row[4])) return "do45";
  if (toStr(row[5])) return "h4to24";
  if (toStr(row[6])) return "gt24";
  return null;
}

function buildPatient(row: unknown[]): Patient | null {
  const fio = toStr(row[0]);
  if (!fio) return null;
  const age = toNum(row[1]);
  const window = detectWindow(row);
  const type = detectType(row[7]);
  const place = toStr(row[8]);
  const oritGroup = detectOrit(place);
  const nihss = toNum(row[10]);
  const tlt = fio.includes("ТЛТ");
  const te = fio.includes("ТЭ");
  return { fio, age, window, type, oritGroup, nihss, tlt, te };
}

export function parseDailyWorkbook(
  buffer: ArrayBuffer,
  sourceFileName: string
): DayData | null {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const warnings: string[] = [];

  const row2 = rows[1] || [];
  let date = parseHeaderDate(row2[1]);
  if (!date) {
    date = parseDateFromFilename(sourceFileName);
    if (date) {
      warnings.push(
        `Дата в шапке файла "${sourceFileName}" не заполнена — дата взята из имени файла`
      );
    }
  }
  if (!date) {
    warnings.push(`Не удалось определить дату в файле ${sourceFileName}`);
    return null;
  }

  const row3 = rows[2] || [];
  const neurologists = [toStr(row3[3]), toStr(row3[4])].filter(Boolean);

  const row4 = rows[3] || []; // Входящие
  const incD = toNum(row4[3]) || 0;
  const incE = toNum(row4[4]) || 0;
  const incomingTotal = toNum(row4[5]) ?? incD + incE;
  const ambulatory = toNum(row4[8]) || 0;

  const row5 = rows[4] || []; // Подтвержденные
  const confD = toNum(row5[3]) || 0;
  const confE = toNum(row5[4]) || 0;
  const confirmedTotal = toNum(row5[5]) ?? confD + confE;
  const inHospital = toNum(row5[8]) || 0;

  const row6 = rows[5] || []; // Другой диагноз
  const otherDiagnosis = (toNum(row6[3]) || 0) + (toNum(row6[4]) || 0);

  const row7 = rows[6] || []; // Перевод / ТЛТ / ТЭ
  const transfers = (toNum(row7[3]) || 0) + (toNum(row7[4]) || 0);
  const tlt = toNum(row7[6]) || 0;
  const te = toNum(row7[8]) || 0;

  // Найти строку заголовка таблицы пациентов ("ФИО")
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (toStr((rows[i] || [])[0]) === "ФИО") {
      headerRowIdx = i;
      break;
    }
  }

  const patients: Patient[] = [];
  const inHospitalPatients: Patient[] = [];

  if (headerRowIdx === -1) {
    warnings.push(
      `Не найдена таблица пациентов (строка "ФИО") в файле ${sourceFileName}`
    );
  } else {
    let seenMarker = false;
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const colA = toStr(row[0]);
      if (colA.toUpperCase().includes("ВНУТРИГОСПИТАЛЬНЫЕ")) {
        seenMarker = true;
        continue;
      }
      if (!colA) continue; // пустая строка-разделитель
      const p = buildPatient(row);
      if (!p) continue;
      if (seenMarker) inHospitalPatients.push(p);
      else patients.push(p);
    }
  }

  return {
    dateKey: dateKey(date),
    date,
    sourceFileName,
    neurologists,
    incomingTotal,
    confirmedTotal,
    otherDiagnosis,
    transfers,
    tlt,
    te,
    ambulatory,
    inHospital,
    patients,
    inHospitalPatients,
    warnings,
  };
}
