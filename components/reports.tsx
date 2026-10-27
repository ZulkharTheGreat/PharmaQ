"use client";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { useApp } from "./context";
import { csv, report } from "../lib/domain/selectors";
import { duration } from "../lib/domain/time";
import { stageLabels, Stage } from "../lib/domain/types";
import { download, Field } from "./forms";
export function Reports() {
  const { state, now } = useApp();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const r = report(state, from, to, now);
  const metrics: [string, string | number][] = [
    ["Всего в периоде", r.cases.length],
    ["Открыто", r.open],
    ["Просрочено", r.overdue],
    ["Закрыто с известными датами", r.completed],
    ["Среднее время закрытия", duration(r.averageClosureHours)],
    [
      "В срок, первоначальный",
      r.onTimeOriginal === undefined
        ? "Нет данных"
        : `${Math.round(r.onTimeOriginal)}%`,
    ],
    [
      "В срок, действующий",
      r.onTimeCurrent === undefined
        ? "Нет данных"
        : `${Math.round(r.onTimeCurrent)}%`,
    ],
    ["Повторные события", r.repeat],
  ];
  return (
    <section className="workspace-section reports">
      <div className="page-heading">
        <h1>Отчёты</h1>
        <div className="button-row">
          <button
            onClick={() =>
              download(
                new Blob(
                  [
                    csv([
                      ["Показатель", "Значение"],
                      ...metrics,
                      ["Ожидания (календарные часы)", r.waitingHours],
                      ...Object.entries(r.byStage).map(([k, v]) => [
                        stageLabels[k as Stage],
                        v,
                      ]),
                    ]),
                  ],
                  { type: "text/csv;charset=utf-8" },
                ),
                "pharmaq-report.csv",
              )
            }
          >
            <Download size={16} /> CSV
          </button>
          <button onClick={() => window.print()}>
            <Printer size={16} /> Печать / PDF
          </button>
        </div>
      </div>
      <div className="report-filters">
        <Field label="Регистрация с">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="По">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <button
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Весь период
        </button>
      </div>
      {from && to && from > to ? (
        <p className="error">Начало периода позже окончания.</p>
      ) : (
        <>
          <div className="metrics">
            {metrics.map(([label, val]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
          <section className="report-section">
            <h2>Календарное время по этапам</h2>
            {Object.keys(r.byStage).length ? (
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Этап</th>
                    <th>Сумма интервалов дел</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.byStage).map(([k, v]) => (
                    <tr key={k}>
                      <td>{stageLabels[k as Stage]}</td>
                      <td>{duration(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Нет данных об интервалах этапов.</p>
            )}
            <p className="hint">
              Ожидания заданий: {duration(r.waitingHours)}. Параллельные работы
              не суммируются в возраст дела. Это календарные интервалы, не
              трудозатраты.
            </p>
          </section>
          <details>
            <summary>Как рассчитаны показатели</summary>
            <p>
              Период отбирает дела по дате регистрации. Среднее закрытие
              учитывает только обычные закрытые дела с известными датами.
              Прежние записи без точных событий исключены из этого среднего.
              Дела без даты регистрации входят в общий обзор за весь период, но
              исключаются при отборе дат. Доля выполнения в срок сравнивает
              приёмку результата с первоначальным и действующим сроком задания.
              Повторы — новые дела с явной связью на предыдущее.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
