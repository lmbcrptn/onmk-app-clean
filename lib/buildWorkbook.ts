import * as XLSX from "xlsx";
import { ColumnAgg } from "./types";

function colLetter(n: number): string {
  // n is 1-based column index
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function ref(col: number, row: number): string {
  return `${colLetter(col)}${row}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellSet = { [ref: string]: any };

function setNum(cells: CellSet, col: number, row: number, v: number) {
  cells[ref(col, row)] = { t: "n", v };
}
function setStr(cells: CellSet, col: number, row: number, v: string) {
  if (!v) return;
  cells[ref(col, row)] = { t: "s", v };
}
function setFormula(cells: CellSet, col: number, row: number, f: string) {
  cells[ref(col, row)] = { t: "n", f };
}
function setDate(cells: CellSet, col: number, row: number, d: Date) {
  cells[ref(col, row)] = { t: "d", v: d, z: "dd.mm.yyyy" };
}

/**
 * Строит один лист сводки (недельный вид: колонки = дни; месячный вид: колонки = недели)
 * columns.length may be любым (не обязательно 7/4) — период произвольный.
 */
export function buildSheet(
  columns: ColumnAgg[],
  mode: "days" | "weeks"
): XLSX.WorkSheet {
  const cells: CellSet = {};
  const FIRST_COL = 2; // B
  const n = columns.length;
  const TOTAL = FIRST_COL + n; // колонка "Всего"
  const CHECK = TOTAL + 1; // колонка "Проверка"

  // ---- Заголовок ----
  setStr(cells, 1, 1, "Дата");
  columns.forEach((c, i) => {
    const col = FIRST_COL + i;
    if (mode === "days" && c.label.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
      const [d, m, y] = c.label.split(".").map(Number);
      setDate(cells, col, 1, new Date(y, m - 1, d));
    } else {
      setStr(cells, col, 1, c.label);
    }
  });
  setStr(cells, TOTAL, 1, "Всего");
  setStr(cells, CHECK, 1, "Проверка");

  // ---- Строки 2-7: базовые показатели ----
  const row2 = 2; // Входящие
  const row3 = 3; // Подтвержденные
  const row4 = 4; // Переводы
  const row5 = 5; // Амбулаторно
  const row6 = 6; // Внутригоспитальные
  const row7 = 7; // Другие дз

  setStr(cells, 1, row2, "Входящие");
  setStr(cells, 1, row3, "Подтвержденные");
  setStr(cells, 1, row4, "Переводы");
  setStr(cells, 1, row5, "Амбулаторно");
  setStr(cells, 1, row6, "Внутригоспитальные");
  setStr(cells, 1, row7, "Другие дз");

  columns.forEach((c, i) => {
    const col = FIRST_COL + i;
    setNum(cells, col, row2, c.incoming);
    setNum(cells, col, row3, c.confirmed);
    setNum(cells, col, row4, c.transfers);
    setNum(cells, col, row5, c.ambulatory);
    setNum(cells, col, row6, c.inHospital);
    setNum(cells, col, row7, c.otherDiagnosis);
  });

  const lastDataCol = colLetter(FIRST_COL + n - 1);
  const firstDataCol = colLetter(FIRST_COL);
  const sumRange = (r: number) => `${firstDataCol}${r}:${lastDataCol}${r}`;

  setFormula(cells, TOTAL, row2, `SUM(${sumRange(row2)})`);
  setFormula(cells, TOTAL, row3, `SUM(${sumRange(row3)})`);
  setFormula(cells, TOTAL, row4, `SUM(${sumRange(row4)})`);
  setFormula(cells, TOTAL, row5, `SUM(${sumRange(row5)})`);
  setFormula(cells, TOTAL, row6, `SUM(${sumRange(row6)})`);
  setFormula(cells, TOTAL, row7, `SUM(${sumRange(row7)})`);

  const T = colLetter(TOTAL);
  setFormula(cells, CHECK, row2, `${T}${row3}+${T}${row5}+${T}${row7}`);
  setFormula(cells, CHECK, row3, `${T}8+${T}20`);
  setFormula(cells, CHECK, row5, `${T}${row2}-${T}${row3}-${T}${row7}`);
  setFormula(cells, CHECK + 1, row5, `${T}${row5}+${T}${row7}`);

  // ---- ОРИТ-блоки (ОРИТ3 начиная со строки 8, ОРИТ10 начиная со строки 20) ----
  function writeOritBlock(startRow: number, key: "orit3" | "orit10") {
    const rTotal = startRow;
    const rII = startRow + 1;
    const rGT = startRow + 2;
    const rDo45 = startRow + 3;
    const rGiDo45 = startRow + 4;
    const rNL4 = startRow + 5;
    const rN520 = startRow + 6;
    const rNG20 = startRow + 7;
    const rA45 = startRow + 8;
    const rA60 = startRow + 9;
    const rA60p = startRow + 10;
    const rTltTe = startRow + 11;

    setStr(cells, 1, rTotal, key === "orit3" ? "ОРИТ3" : "ОРИТ10");
    setStr(cells, 1, rII, "ИИ");
    setStr(cells, 1, rGT, "ГТ");
    setStr(cells, 1, rDo45, "до 4,5");
    setStr(cells, 1, rGiDo45, "ГИ до 4,5");
    setStr(cells, 1, rNL4, "NIHHS <4");
    setStr(cells, 1, rN520, "NIHHS 5-20");
    setStr(cells, 1, rNG20, "NIHHS >20");
    setStr(cells, 1, rA45, "До 45");
    setStr(cells, 1, rA60, "ДО 60");
    setStr(cells, 1, rA60p, "Старше 60");
    setStr(cells, 1, rTltTe, "ТЛТ, ТЭ");

    columns.forEach((c, i) => {
      const col = FIRST_COL + i;
      const s = c[key];
      setNum(cells, col, rTotal, s.total);
      setNum(cells, col, rII, s.ii);
      setNum(cells, col, rGT, s.gt);
      setNum(cells, col, rDo45, s.do45);
      setNum(cells, col, rGiDo45, s.giDo45);
      setNum(cells, col, rNL4, s.nihssLt4);
      setNum(cells, col, rN520, s.nihss5to20);
      setNum(cells, col, rNG20, s.nihssGt20);
      setNum(cells, col, rA45, s.ageLt45);
      setNum(cells, col, rA60, s.ageLe60);
      setNum(cells, col, rA60p, s.ageGt60);
      if (mode === "days") {
        if (s.tltTeLabel) setStr(cells, col, rTltTe, s.tltTeLabel);
        else setNum(cells, col, rTltTe, 0);
      } else {
        setNum(cells, col, rTltTe, s.tltTeCount);
      }
    });

    [
      rTotal,
      rII,
      rGT,
      rDo45,
      rGiDo45,
      rNL4,
      rN520,
      rNG20,
      rA45,
      rA60,
      rA60p,
    ].forEach((r) => setFormula(cells, TOTAL, r, `SUM(${sumRange(r)})`));
    // ТЛТ,ТЭ total: числовая сумма (текстовые ячейки Excel в SUM игнорирует)
    setFormula(cells, TOTAL, rTltTe, `SUM(${sumRange(rTltTe)})`);

    setFormula(
      cells,
      CHECK,
      rTotal,
      `${T}${rNL4}+${T}${rN520}+${T}${rNG20}`
    );

    // Правая QA-панель (ИИ/ГИ перекрёстная проверка) — только для блока ОРИТ3,
    // но ссылается на обе группы (rII/rGT текущего блока + соответствующие строки другого блока)
    if (key === "orit3") {
      const otherII = 21;
      const otherGT = 22;
      const K = TOTAL + 2; // метка
      const L = TOTAL + 3; // значение (сумма по обеим группам)
      const M = TOTAL + 4; // проверка
      const Lc = colLetter(L);
      const Mc = colLetter(M);

      setStr(cells, K, rII, "ИИ");
      setFormula(cells, L, rII, `${T}${rII}+${T}${otherII}`);
      setStr(cells, K, rGT, "ГИ");
      setFormula(cells, L, rGT, `${T}${rGT}+${T}${otherGT}`);
      setFormula(cells, M, rII, `${Lc}${rDo45}-${Lc}${rGT}`);
      setFormula(cells, M, rGT, `${Lc}${rDo45}-${Lc}${rII}`);
      setFormula(cells, L, rDo45, `${Lc}${rII}+${Lc}${rGT}`);
      setFormula(cells, M, rDo45, `${T}${row5}+${T}${row7}`);
      setFormula(cells, M + 1, rDo45, `${Lc}${rDo45}+${Mc}${rDo45}`);

      // Статичные подписи QA-блока (не вычисляются — заполняются вручную, как договорились)
      setStr(cells, M, rTotal, "Проверка");
      setStr(cells, M + 2, rTotal, "Индикаторы проверки");
      setStr(cells, M + 3, rTotal, "дб");
      setStr(cells, M + 4, rTotal, "по факту");
      setStr(cells, K, rNL4, "Подтипы");
      setStr(cells, K, rN520, "АТ");
      setStr(cells, K, rNG20, "КИ");
      setStr(cells, K, rA45, "Неу");
      setStr(cells, K, rA60, "Лак");
      setStr(cells, K, rTltTe, "Другое");
    }
    if (key === "orit10") {
      const K = TOTAL + 2;
      setStr(cells, K, rII, "Выписаны");
    }
  }

  writeOritBlock(8, "orit3");
  writeOritBlock(20, "orit10");

  const lastRow = 31;
  const lastColUsed = TOTAL + 8;
  const wsRef = `A1:${colLetter(Math.max(lastColUsed, CHECK + 1))}${lastRow}`;

  const ws: CellSet = { "!ref": wsRef };
  for (const key of Object.keys(cells)) {
    ws[key] = cells[key];
  }

  // Ширины колонок
  ws["!cols"] = [
    { wch: 22 },
    ...Array(n).fill({ wch: 12 }),
    { wch: 10 },
    { wch: 10 },
  ];

  return ws as XLSX.WorkSheet;
}

export function buildWorkbookFile(
  columns: ColumnAgg[],
  mode: "days" | "weeks",
  sheetName = "Лист1"
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = buildSheet(columns, mode);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Лист2");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}
