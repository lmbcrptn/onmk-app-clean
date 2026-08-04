import { ColumnAgg, GroupStats } from "./types";

function groupDiscrepancies(
  columnLabel: string,
  groupName: "ОРИТ3" | "ОРИТ10",
  g: GroupStats
): string[] {
  const msgs: string[] = [];

  const typeSum = g.ii + g.gt;
  if (typeSum !== g.total) {
    msgs.push(
      `${columnLabel}, ${groupName}: сумма ИИ+ГТ (${typeSum}) не совпадает с общим числом пациентов группы (${g.total}). ` +
        `Вероятная причина: у одного или нескольких пациентов не указан или указан нестандартно тип ОНМК (столбец «Тип ОНМК» должен быть 1 или 2).`
    );
  }

  const nihssSum = g.nihssLt4 + g.nihss5to20 + g.nihssGt20;
  if (nihssSum !== g.total) {
    msgs.push(
      `${columnLabel}, ${groupName}: сумма по группам NIHSS (${nihssSum}) не совпадает с общим числом пациентов (${g.total}). ` +
        `Вероятная причина: у кого-то из пациентов не заполнен балл NIHSS.`
    );
  }

  const ageSum = g.ageLt45 + g.ageLe60 + g.ageGt60;
  if (ageSum !== g.total) {
    msgs.push(
      `${columnLabel}, ${groupName}: сумма по возрастным группам (${ageSum}) не совпадает с общим числом пациентов (${g.total}). ` +
        `Вероятная причина: у кого-то из пациентов не указан возраст.`
    );
  }

  return msgs;
}

/**
 * Пересчитывает те же соотношения, что заложены в формулах столбца «Проверка»
 * итогового файла, и возвращает список расхождений на понятном языке.
 * Пустой массив — расхождений нет.
 */
export function checkColumnDiscrepancies(c: ColumnAgg): string[] {
  const msgs: string[] = [];

  const incomingCheck = c.confirmed + c.ambulatory + c.otherDiagnosis;
  if (incomingCheck !== c.incoming) {
    msgs.push(
      `${c.label}: «Входящие» (${c.incoming}) не совпадает с суммой «Подтвержденные + Амбулаторно + Другие дз» (${incomingCheck}). ` +
        `Вероятная причина: в одном из дневных файлов за этот период неверно указан общий итог «Входящие», либо не заполнено поле «Амбулаторно» или «Другой диагноз».`
    );
  }

  const confirmedCheck = c.orit3.total + c.orit10.total;
  if (confirmedCheck !== c.confirmed) {
    msgs.push(
      `${c.label}: «Подтвержденные» (${c.confirmed}) не совпадает с суммой ОРИТ3 + ОРИТ10 (${confirmedCheck}). ` +
        `Вероятная причина: у кого-то из подтверждённых пациентов в столбце «Место госпитализации» не указано ОРИТ 3 или ОРИТ 10 (например, стоит другое отделение или поле пустое), либо общий итог «Подтвержденные» в дневном файле указан неверно.`
    );
  }

  msgs.push(...groupDiscrepancies(c.label, "ОРИТ3", c.orit3));
  msgs.push(...groupDiscrepancies(c.label, "ОРИТ10", c.orit10));

  return msgs;
}

export function checkAllColumns(columns: ColumnAgg[]): string[] {
  return columns.flatMap((c) => checkColumnDiscrepancies(c));
}
