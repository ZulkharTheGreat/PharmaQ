"use client";
import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { useApp } from "./context";
import { workQueue } from "../lib/domain/selectors";
import { dateLabel } from "../lib/domain/time";
export function Work({ onCreate }: { onCreate: () => void }) {
  const { state, user, now, open } = useApp();
  const [category, setCategory] = useState("all");
  const queue = workQueue(state, user);
  const tabs = {
    all: "Все",
    incoming: "Входящие",
    doing: "В работе",
    review: "Проверка",
    waiting: "Ожидание",
  };
  const rows = queue.filter(
    (x) => category === "all" || x.category === category,
  );
  return (
    <section className="workspace-section">
      <div className="page-heading">
        <h1>
          Моя работа <span className="count">{queue.length}</span>
        </h1>
        {user.role !== "admin" && (
          <button className="primary" onClick={onCreate}>
            <Plus size={18} /> Отклонение
          </button>
        )}
      </div>
      <div className="view-tabs">
        {Object.entries(tabs).map(([k, v]) => (
          <button
            key={k}
            className={category === k ? "active" : ""}
            onClick={() => setCategory(k)}
          >
            {v}
            <span className="count">
              {queue.filter((x) => k === "all" || x.category === k).length}
            </span>
          </button>
        ))}
      </div>
      <div className="work-list">
        {rows.map((w) => (
          <button
            className="work-row"
            key={w.id}
            onClick={() => open(w.caseId, w.section)}
          >
            <span className={`work-symbol ${w.category}`}>
              {w.category === "review"
                ? "✓"
                : w.category === "waiting"
                  ? "◷"
                  : "↗"}
            </span>
            <span className="work-title">
              <b>{w.title}</b>
              <small>
                {state.cases.find((c) => c.id === w.caseId)?.number} ·{" "}
                {w.function}
              </small>
            </span>
            <span className={w.due && w.due < now ? "danger" : "muted"}>
              {dateLabel(w.due)}
              {w.due && w.due < now && <small>Просрочено</small>}
            </span>
            <ArrowUpRight size={17} />
          </button>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">
          <h3>
            {user.role === "admin"
              ? "Нет производственных назначений"
              : "В этой очереди нет заданий"}
          </h3>
          <p>
            {user.role === "admin"
              ? "Участники, справочники и параметры доступны в настройках."
              : "Новые назначения и решения появятся здесь."}
          </p>
        </div>
      )}
    </section>
  );
}
