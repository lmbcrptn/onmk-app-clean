"use client";

import { useState, useRef } from "react";

type Mode = "auto" | "days" | "weeks";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [checkWarnings, setCheckWarnings] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".xlsx")
    );
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.name, f]));
      arr.forEach((f) => map.set(f.name, f));
      return Array.from(map.values());
    });
    setSuccess(false);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleSubmit() {
    setError(null);
    setWarnings([]);
    setCheckWarnings([]);
    setSuccess(false);

    if (!files.length) {
      setError("Загрузите хотя бы один дневной файл (.xlsx)");
      return;
    }
    if (!start || !end) {
      setError("Укажите период (даты начала и окончания)");
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("start", start);
      fd.append("end", end);
      fd.append("mode", mode);

      const res = await fetch("/api/process", { method: "POST", body: fd });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка сервера (${res.status})`);
      }

      const warningsHeader = res.headers.get("X-Warnings");
      if (warningsHeader) {
        try {
          setWarnings(JSON.parse(decodeURIComponent(warningsHeader)));
        } catch {
          /* ignore */
        }
      }

      const checkWarningsHeader = res.headers.get("X-Check-Warnings");
      if (checkWarningsHeader) {
        try {
          setCheckWarnings(JSON.parse(decodeURIComponent(checkWarningsHeader)));
        } catch {
          /* ignore */
        }
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match ? match[1] : "Свод.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Сводки ОНМК</h1>
      <p className="subtitle">
        Загрузите дневные и/или недельные сводки (программа определит тип
        каждого файла сама), выберите период — получите недельную или
        месячную сводку в том же формате Excel.
      </p>

      <div className="card">
        <h2>1. Файлы (.xlsx) — дневные и/или недельные</h2>
        <div
          className={`dropzone${drag ? " drag" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          Перетащите файлы сюда или нажмите, чтобы выбрать
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>
        {files.length > 0 && (
          <ul className="file-list">
            {files.map((f) => (
              <li key={f.name}>
                <span>{f.name}</span>
                <button onClick={() => removeFile(f.name)}>Удалить</button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">Загружено файлов: {files.length}</p>
      </div>

      <div className="card">
        <h2>2. Период сводки</h2>
        <div className="row">
          <div className="field">
            <label>С</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label>По</label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Вид сводки</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="auto">Автоматически (по длине периода)</option>
            <option value="days">Недельная — колонки по дням</option>
            <option value="weeks">Месячная — колонки по неделям</option>
          </select>
        </div>
        <p className="hint">
          Период до 7 дней по умолчанию выводится по дням (как недельная
          сводка), более 7 дней — по неделям (как месячная сводка).
        </p>
      </div>

      <button className="btn" disabled={loading} onClick={handleSubmit}>
        {loading ? "Формирование..." : "Сформировать сводку"}
      </button>

      {error && <div className="error">{error}</div>}
      {success && !error && (
        <div className="success">Готово — файл скачан.</div>
      )}
      {checkWarnings.length > 0 && (
        <div className="checkWarnings">
          <strong>⚠ Расхождения в столбце «Проверка»</strong>
          <p className="hint">
            Числа в итоговом файле не сходятся по внутренним контрольным
            соотношениям. Скорее всего дело в одном из исходных дневных
            файлов — детали ниже:
          </p>
          <ul>
            {checkWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="warnings">
          Замечания:
          {"\n"}
          {warnings.join("\n")}
        </div>
      )}

      <p className="footer">создано lmbcrptn ai</p>
    </div>
  );
}
