import { DayData, Patient, GroupStats, ColumnAgg, DayAgg } from "./types";

export const emptyStats = (): GroupStats => ({
  total: 0,
  ii: 0,
  gt: 0,
  do45: 0,
  giDo45: 0,
  nihssLt4: 0,
  nihss5to20: 0,
  nihssGt20: 0,
  ageLt45: 0,
  ageLe60: 0,
  ageGt60: 0,
  tltTeCount: 0,
  tltTeLabel: "",
});

/** Считает статистику по группе пациентов одного дня (уже отфильтрованных по ОРИТ3/ОРИТ10) */
function computeGroupStats(patients: Patient[]): GroupStats {
  const s = emptyStats();
  s.total = patients.length;
  const tags: string[] = [];
  for (const p of patients) {
    if (p.type === 1) s.ii++;
    if (p.type === 2) s.gt++;
    if (p.window === "do45" && p.type === 1) s.do45++;
    if (p.window === "do45" && p.type === 2) s.giDo45++;
    if (p.nihss !== null) {
      if (p.nihss <= 4) s.nihssLt4++;
      else if (p.nihss <= 20) s.nihss5to20++;
      else s.nihssGt20++;
    }
    if (p.age !== null) {
      if (p.age < 45) s.ageLt45++;
      else if (p.age <= 60) s.ageLe60++;
      else s.ageGt60++;
    }
    if (p.tlt || p.te) {
      s.tltTeCount++;
      if (p.tlt && p.te) tags.push("ТЛТ+ТЭ");
      else if (p.tlt) tags.push("ТЛТ");
      else tags.push("ТЭ");
    }
  }
  s.tltTeLabel = tags.length ? `${s.tltTeCount}, ${tags.join("; ")}` : "";
  return s;
}

/** Складывает несколько GroupStats в одну (для объединения дней в неделю/месяц).
 *  Текстовую метку ТЛТ/ТЭ сохраняем только если это ровно один день — иначе просто число. */
export function sumGroupStats(list: GroupStats[]): GroupStats {
  const s = emptyStats();
  for (const g of list) {
    s.total += g.total;
    s.ii += g.ii;
    s.gt += g.gt;
    s.do45 += g.do45;
    s.giDo45 += g.giDo45;
    s.nihssLt4 += g.nihssLt4;
    s.nihss5to20 += g.nihss5to20;
    s.nihssGt20 += g.nihssGt20;
    s.ageLt45 += g.ageLt45;
    s.ageLe60 += g.ageLe60;
    s.ageGt60 += g.ageGt60;
    s.tltTeCount += g.tltTeCount;
  }
  s.tltTeLabel = list.length === 1 ? list[0].tltTeLabel : "";
  return s;
}

/** Превращает разобранный дневной файл (с таблицей пациентов) в единый формат DayAgg */
export function dayDataToAgg(day: DayData): DayAgg {
  const orit3 = computeGroupStats(
    day.patients.filter((p) => p.oritGroup === "ОРИТ3")
  );
  const orit10 = computeGroupStats(
    day.patients.filter((p) => p.oritGroup === "ОРИТ10")
  );
  return {
    dateKey: day.dateKey,
    date: day.date,
    incoming: day.incomingTotal,
    confirmed: day.confirmedTotal,
    transfers: day.transfers,
    ambulatory: day.ambulatory,
    inHospital: day.inHospital,
    otherDiagnosis: day.otherDiagnosis,
    orit3,
    orit10,
    source: "daily",
    warnings: day.warnings,
  };
}

export function emptyDayAgg(date: Date, dateKey: string): DayAgg {
  return {
    dateKey,
    date,
    incoming: 0,
    confirmed: 0,
    transfers: 0,
    ambulatory: 0,
    inHospital: 0,
    otherDiagnosis: 0,
    orit3: emptyStats(),
    orit10: emptyStats(),
    source: "daily",
    warnings: [],
  };
}

/** Строит одну колонку сводки (день или неделя) из набора DayAgg */
export function buildColumn(
  days: DayAgg[],
  label: string,
  commentText?: string
): ColumnAgg {
  const incoming = days.reduce((a, d) => a + d.incoming, 0);
  const confirmed = days.reduce((a, d) => a + d.confirmed, 0);
  const transfers = days.reduce((a, d) => a + d.transfers, 0);
  const ambulatory = days.reduce((a, d) => a + d.ambulatory, 0);
  const inHospital = days.reduce((a, d) => a + d.inHospital, 0);
  const otherDiagnosis = days.reduce((a, d) => a + d.otherDiagnosis, 0);

  const orit3 = sumGroupStats(days.map((d) => d.orit3));
  const orit10 = sumGroupStats(days.map((d) => d.orit10));

  return {
    label,
    commentText,
    incoming,
    confirmed,
    transfers,
    ambulatory,
    inHospital,
    otherDiagnosis,
    orit3,
    orit10,
  };
}

const RU_MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function fmtShort(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]}`;
}

/** Все календарные даты периода [start, end] включительно, по порядку */
export function makeDateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let guard = 0;
  while (cur <= last && guard < 3660) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return out;
}

/** Разбивает последовательность календарных дат на 7-дневные окна (недели), начиная с первой даты */
export function chunkDatesIntoWeeks(dates: Date[]): Date[][] {
  const chunks: Date[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    chunks.push(dates.slice(i, i + 7));
  }
  return chunks;
}

export function weekRangeLabel(dates: Date[]): string {
  if (dates.length === 0) return "";
  return `${fmtShort(dates[0])} — ${fmtShort(dates[dates.length - 1])}`;
}
