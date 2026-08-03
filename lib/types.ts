export type OritGroup = "ОРИТ3" | "ОРИТ10" | "other";
export type Window = "do45" | "h4to24" | "gt24" | null;
export type StrokeType = 1 | 2 | null;

export interface Patient {
  fio: string;
  age: number | null;
  window: Window;
  type: StrokeType;
  oritGroup: OritGroup;
  nihss: number | null;
  tlt: boolean;
  te: boolean;
}

export interface DayData {
  /** Дата дня в формате YYYY-MM-DD (используется как ключ) */
  dateKey: string;
  date: Date;
  sourceFileName: string;
  neurologists: string[];
  incomingTotal: number;
  confirmedTotal: number;
  otherDiagnosis: number;
  transfers: number;
  tlt: number;
  te: number;
  ambulatory: number;
  inHospital: number;
  /** Основной список поступивших (используется для разбивки по ОРИТ/типу/NIHSS/возрасту) */
  patients: Patient[];
  /** Внутригоспитальные ОНМК — только считаются в inHospital, в разбивку не идут */
  inHospitalPatients: Patient[];
  warnings: string[];
}

export interface GroupStats {
  total: number;
  ii: number; // ишемический инсульт
  gt: number; // геморрагический инсульт (ГТ/ГИ)
  do45: number; // ишемия, окно до 4.5ч
  giDo45: number; // геморрагия, окно до 4.5ч
  nihssLt4: number;
  nihss5to20: number;
  nihssGt20: number;
  ageLt45: number;
  ageLe60: number;
  ageGt60: number;
  tltTeCount: number; // сколько пациентов помечены ТЛТ и/или ТЭ
  tltTeLabel: string; // человекочитаемый список тегов (для дневного/недельного вида)
}

export interface DayAgg {
  dateKey: string;
  date: Date;
  incoming: number;
  confirmed: number;
  transfers: number;
  ambulatory: number;
  inHospital: number;
  otherDiagnosis: number;
  orit3: GroupStats;
  orit10: GroupStats;
  /** Источник: 'daily' — разобран из дневного файла (по пациентам),
   *  'weekly' — числа взяты напрямую из ячеек недельного файла */
  source: "daily" | "weekly";
  warnings: string[];
}

export interface ColumnAgg {
  label: string; // подпись колонки: дата или "Всего"/"Неделя N"
  commentText?: string; // доп. подсказка (диапазон дат недели) — идёт в комментарий к ячейке
  incoming: number;
  confirmed: number;
  transfers: number;
  ambulatory: number;
  inHospital: number;
  otherDiagnosis: number;
  orit3: GroupStats;
  orit10: GroupStats;
}
