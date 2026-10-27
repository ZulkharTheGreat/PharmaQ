"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  Plus,
  Search,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useApp } from "./context";
import {
  csv,
  filterCases,
  overdue,
  RegistryFilter,
  stageAge,
  severityOf,
} from "../lib/domain/selectors";
import { participates, person } from "../lib/domain/permissions";
import { dateLabel, duration } from "../lib/domain/time";
import { Deviation, severityLabels, stageLabels } from "../lib/domain/types";
import { download, Field } from "./forms";
export const initialFilter: RegistryFilter = {
  query: "",
  view: "all",
  stage: "",
  severity: "",
  area: "",
  owner: "",
  sort: "number",
  direction: "desc",
};
export function SeverityMark({ item }: { item: Deviation }) {
  const value = item.assessments.at(-1)?.severity;
  return value ? (
    <span className={`severity ${value}`}>{severityLabels[value]}</span>
  ) : item.legacy?.raw.severity ? (
    <span className={`severity ${severityOf(item) || ""}`}>
      {String(item.legacy.raw.severity)} · прежняя оценка
    </span>
  ) : (
    <span className="muted">Не оценено</span>
  );
}
export function StageMark({ item }: { item: Deviation }) {
  return (
    <span className={`stage ${item.stage}`}>
      <i />
      {stageLabels[item.stage]}
    </span>
  );
}
export function Registry({
  selectedId,
  onCreate,
}: {
  selectedId?: string;
  onCreate: () => void;
}) {
  const { state, user, now, open, run, toast } = useApp();
  const saved = state.views[user.id] as
    | { filter?: RegistryFilter; columns?: string[]; pageSize?: number }
    | undefined;
  const [filter, setFilter] = useState<RegistryFilter>({
    ...initialFilter,
    ...saved?.filter,
  });
  const [columns, setColumns] = useState(
    saved?.columns || ["area", "stage", "owner", "stageAge", "due"],
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(saved?.pageSize || 8);
  const rows = useMemo(
    () => filterCases(state, filter, user.id, now),
    [state, filter, user.id, now],
  );
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const slice = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const change = (key: keyof RegistryFilter, value: string) => {
    setFilter((v) => ({ ...v, [key]: value }));
    setPage(1);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      void run("save_view", { view: { filter, columns, pageSize } }).catch(
        (e) => toast(`Представление не сохранено: ${e.message}`),
      );
    }, 600);
    return () =>
      clearTimeout(
        timer,
      ); /* run intentionally uses the latest repository revision */
  }, [filter, columns, pageSize]);
  const allCounts = {
    all: state.cases.length,
    mine: state.cases.filter((c) => participates(c, user.id)).length,
    overdue: state.cases.filter((c) => overdue(c, now)).length,
  };
  const columnNames: Record<string, string> = {
    area: "Участок",
    stage: "Этап",
    owner: "Ответственный",
    stageAge: "На этапе",
    due: "Срок",
    product: "Объекты / серии",
    severity: "Критичность",
  };
  const sort = (key: string) => {
    setFilter((f) => ({
      ...f,
      sort: key,
      direction: f.sort === key && f.direction === "asc" ? "desc" : "asc",
    }));
  };
  const exported = () =>
    download(
      new Blob(
        [
          csv([
            [
              "Номер",
              "Название",
              "Участок",
              "Этап",
              "Ответственный",
              "Срок",
              "Первоначальный срок",
              "Объекты",
            ],
            ...rows.map((c) => [
              c.number,
              c.title,
              c.line,
              stageLabels[c.stage],
              person(state, c.coordinatorId),
              c.due,
              c.originalDue,
              c.objects.map((o) => `${o.name} ${o.batch}`).join("; "),
            ]),
          ]),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      "pharmaq-deviations.csv",
    );
  return (
    <section className="registry workspace-section">
      <div className="page-heading">
        <h1>
          Отклонения <span className="count">{state.cases.length}</span>
        </h1>
        {user.role !== "admin" && (
          <button className="primary" onClick={onCreate}>
            <Plus size={18} /> Отклонение
          </button>
        )}
      </div>
      <div className="view-tabs" aria-label="Представления реестра">
        {(["all", "mine", "overdue"] as const).map((v) => (
          <button
            key={v}
            className={filter.view === v ? "active" : ""}
            onClick={() => change("view", v)}
          >
            {v === "all" ? "Все" : v === "mine" ? "Мои" : "Просрочено"}{" "}
            <span className="count">{allCounts[v]}</span>
          </button>
        ))}
      </div>
      <div className="registry-toolbar">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Поиск отклонений"
            placeholder="Поиск"
            value={filter.query}
            onChange={(e) => change("query", e.target.value)}
          />
        </label>
        <button
          aria-expanded={showFilters}
          className={showFilters ? "selected-button" : ""}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={16} /> Фильтры
        </button>
        <span className="spacer" />
        <button
          className="quiet"
          aria-expanded={showColumns}
          onClick={() => setShowColumns(!showColumns)}
        >
          <Columns3 size={17} /> Столбцы
        </button>
        <details className="table-menu">
          <summary aria-label="Действия таблицы">⋯</summary>
          <button onClick={exported}>
            <Download size={16} /> Экспорт CSV
          </button>
        </details>
      </div>
      {showFilters && (
        <div className="filter-grid">
          <Field label="Этап">
            <select
              value={filter.stage}
              onChange={(e) => change("stage", e.target.value)}
            >
              <option value="">Все этапы</option>
              {Object.entries(stageLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Критичность">
            <select
              value={filter.severity}
              onChange={(e) => change("severity", e.target.value)}
            >
              <option value="">Все уровни</option>
              {Object.entries(severityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Участок">
            <select
              value={filter.area}
              onChange={(e) => change("area", e.target.value)}
            >
              <option value="">Все участки</option>
              {Array.from(new Set(state.cases.map((c) => c.line))).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Ответственный">
            <select
              value={filter.owner}
              onChange={(e) => change("owner", e.target.value)}
            >
              <option value="">Все участники</option>
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            onClick={() => {
              setFilter(initialFilter);
              setPage(1);
            }}
          >
            Сбросить фильтры
          </button>
        </div>
      )}
      {showColumns && (
        <div className="column-picker">
          {Object.entries(columnNames).map(([k, v]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={columns.includes(k)}
                onChange={() =>
                  setColumns(
                    columns.includes(k)
                      ? columns.filter((c) => c !== k)
                      : [...columns, k],
                  )
                }
              />
              {v}
            </label>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <table className="register-table">
          <thead>
            <tr>
              <th
                aria-sort={
                  filter.sort === "title"
                    ? filter.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button onClick={() => sort("title")}>
                  Отклонение{" "}
                  {filter.sort === "title" &&
                    (filter.direction === "asc" ? (
                      <ArrowUp size={12} />
                    ) : (
                      <ArrowDown size={12} />
                    ))}
                </button>
              </th>
              {columns.map((k) => (
                <th key={k}>
                  <button onClick={() => sort(k)}>
                    {columnNames[k]}
                    {filter.sort === k &&
                      (filter.direction === "asc" ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((c) => (
              <tr
                key={c.id}
                className={selectedId === c.id ? "selected" : ""}
                onClick={() => open(c.id)}
              >
                <td className="title-cell">
                  <button onClick={() => open(c.id)} className="row-title">
                    {c.title}
                  </button>
                  <small>
                    {c.number}
                    {severityOf(c) === "critical" && (
                      <span className="critical-inline"> · Критическое</span>
                    )}
                  </small>
                </td>
                {columns.map((k) => (
                  <td key={k}>
                    {k === "area" ? (
                      c.line
                    ) : k === "stage" ? (
                      <StageMark item={c} />
                    ) : k === "owner" ? (
                      person(state, c.coordinatorId)
                    ) : k === "stageAge" ? (
                      duration(stageAge(c, now))
                    ) : k === "due" ? (
                      <span className={overdue(c, now) ? "danger" : ""}>
                        {dateLabel(c.due)}
                        {overdue(c, now) && <small>Просрочено</small>}
                      </span>
                    ) : k === "severity" ? (
                      <SeverityMark item={c} />
                    ) : (
                      c.objects
                        .map(
                          (o) => `${o.name}${o.batch ? ` · ${o.batch}` : ""}`,
                        )
                        .join("; ") || "Не указаны"
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <h3>
              {state.cases.length ? "Записи не найдены" : "Отклонений пока нет"}
            </h3>
            <p>
              {state.cases.length
                ? "Измените поиск или сбросьте фильтры."
                : "Зарегистрируйте первое наблюдение."}
            </p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length
            ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} из ${rows.length}`
            : "0 записей"}
        </span>
        <select
          aria-label="Записей на странице"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[8, 12, 24].map((n) => (
            <option key={n} value={n}>
              {n} на странице
            </option>
          ))}
        </select>
        <button
          className="icon"
          aria-label="Предыдущая страница"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="page-number">
          {currentPage} / {pages}
        </span>
        <button
          className="icon"
          aria-label="Следующая страница"
          disabled={currentPage >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
