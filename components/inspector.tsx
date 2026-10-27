"use client";
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Download,
  Maximize2,
  Minimize2,
  X,
  FileText,
  Plus,
} from "lucide-react";
import { useApp } from "./context";
import {
  CommandType,
  Deviation,
  Stage,
  stageLabels,
  TaskSpec,
} from "../lib/domain/types";
import { isClosed, person, taskDone } from "../lib/domain/permissions";
import { caseAge, stageAge, workQueue } from "../lib/domain/selectors";
import { closureProblems, uid } from "../lib/domain/helpers";
import {
  dateLabel,
  duration,
  hours,
  inputISO,
  localInput,
  DAY,
} from "../lib/domain/time";
import {
  Field,
  FilePicker,
  Form,
  PeopleSelect,
  prepareFiles,
  value,
  download,
  Dialog,
} from "./forms";
import { AssessmentForm, InvestigationForm, CaseFormProps } from "./case-forms";
import { PlanForm } from "./plan";
import { TaskForm } from "./task";
import { SeverityMark, StageMark } from "./registry";
const sectionTitles: Record<string, string> = {
  assessment: "Оценка",
  investigation: "Расследование",
  plan: "План мер",
  details: "Сведения о деле",
  external: "Внешние решения",
  closure: "Решение о закрытии",
  legacy: "Уточнение прежних данных",
  immediate: "Дополнительное задание",
};
export function Inspector({
  item,
  section,
  expanded,
  onSection,
  onExpand,
  onClose,
  onDirty,
  onRepeat,
}: {
  item: Deviation;
  section: string;
  expanded: boolean;
  onSection: (section: string) => void;
  onExpand: () => void;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
  onRepeat: () => void;
}) {
  const { state, user, now } = useApp();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    return () => {
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [item.id]);
  const closed = isClosed(item);
  const docs = state.documents.filter((d) => d.caseId === item.id);
  const events = state.events.filter((e) => e.caseId === item.id);
  const next = workQueue(state, user).find((w) => w.caseId === item.id);
  const activeTask = item.tasks.find((t) => !taskDone(t));
  const task = section.startsWith("task:")
    ? item.tasks.find((t) => t.id === section.slice(5))
    : undefined;
  const onDone = () => {
    onDirty(false);
    onSection("overview");
  };
  const formProps: CaseFormProps = { item, onDone, onDirty };
  return (
    <aside
      ref={panel}
      tabIndex={-1}
      className={`inspector ${expanded ? "expanded" : ""}`}
      aria-label={`Карточка ${item.number}`}
    >
      <div className="inspector-head">
        <div className="row-between">
          <span className="muted">{item.number}</span>
          <div className="button-row">
            <button
              className="icon"
              aria-label={
                expanded ? "Свернуть карточку" : "Развернуть карточку"
              }
              onClick={onExpand}
            >
              {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              className="icon"
              aria-label="Закрыть карточку"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <h2>{item.title}</h2>
        <div className="status-line">
          <StageMark item={item} />
          <SeverityMark item={item} />
        </div>
      </div>
      <div className="inspector-tabs">
        {[
          ["overview", "Обзор"],
          ["documents", `Документы ${docs.length}`],
          ["history", "История"],
        ].map(([key, text]) => (
          <button
            key={key}
            className={
              section === key ||
              (key === "overview" &&
                !["documents", "history"].includes(section))
                ? "active"
                : ""
            }
            onClick={() => onSection(key)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {section === "overview" ? (
          <>
            {item.legacy && (
              <div className="hint">
                Прежняя запись · история неполная
                {item.legacy.needsClarification && (
                  <button
                    className="link-button"
                    onClick={() => onSection("legacy")}
                  >
                    Уточнить данные
                  </button>
                )}
              </div>
            )}
            <dl className="metadata">
              <dt>Ответственный</dt>
              <dd>{person(state, item.coordinatorId)}</dd>
              {item.objects.map((o) => (
                <div className="metadata-group" key={o.id}>
                  <dt>
                    {
                      {
                        product: "Продукт",
                        batch: "Партия",
                        material: "Сырьё",
                        equipment: "Оборудование",
                        area: "Участок",
                      }[o.kind]
                    }
                  </dt>
                  <dd>{o.name}</dd>
                  {o.batch && (
                    <>
                      <dt>Серия / партия</dt>
                      <dd>{o.batch}</dd>
                    </>
                  )}
                  {o.supplierBatch && (
                    <>
                      <dt>Партия поставщика</dt>
                      <dd>{o.supplierBatch}</dd>
                    </>
                  )}
                </div>
              ))}
              <dt>Срок</dt>
              <dd>{dateLabel(item.due, true)}</dd>
            </dl>
            <section className="inspector-section">
              <p className="section-kicker">Следующий шаг</p>
              <h3>
                {closed
                  ? "Дело завершено"
                  : next?.title ||
                    activeTask?.title ||
                    (item.stage === "plan"
                      ? "Подготовить план мер"
                      : "Нет активного назначения")}
              </h3>
              <p className="muted">
                {closed
                  ? item.closureReason ||
                    "Прежняя запись: основание отсутствует"
                  : next
                    ? `${next.function} · ${dateLabel(next.due)}`
                    : activeTask
                      ? person(state, activeTask.performerId)
                      : "Доступные разделы находятся ниже."}
              </p>
              <dl className="metadata timing">
                <dt>Всего открыто</dt>
                <dd>{duration(caseAge(item, now))}</dd>
                <dt>На этапе</dt>
                <dd>{duration(stageAge(item, now))}</dd>
                <dt>Задача назначена</dt>
                <dd>
                  {activeTask?.createdAt
                    ? `${duration(hours(activeTask.createdAt, now))} назад`
                    : "Нет данных"}
                </dd>
              </dl>
              {next && (
                <button onClick={() => onSection(next.section)}>
                  Открыть задачу <ArrowUpRight size={16} />
                </button>
              )}
              {!next && activeTask && !closed && (
                <button onClick={() => onSection(`task:${activeTask.id}`)}>
                  Посмотреть задание
                </button>
              )}
            </section>
            <section className="inspector-section">
              <p className="section-kicker">Последнее событие</p>
              {events.at(-1) ? (
                <div className="last-event">
                  <i />
                  <div>
                    {events.at(-1)!.label}
                    <small>
                      {dateLabel(events.at(-1)!.recordedAt, true)} ·{" "}
                      {person(state, events.at(-1)!.actorId)}
                    </small>
                  </div>
                </div>
              ) : (
                <p className="muted">История событий отсутствует</p>
              )}
            </section>
            <div className="section-links">
              {[
                "details",
                "assessment",
                "investigation",
                "plan",
                "external",
                "closure",
              ].map((key) => (
                <button key={key} onClick={() => onSection(key)}>
                  {sectionTitles[key]}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            <details>
              <summary>Задания · {item.tasks.length}</summary>
              <div className="compact-list">
                {item.tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() =>
                      onSection(
                        t.kind === "assessment"
                          ? "assessment"
                          : t.kind === "investigation"
                            ? "investigation"
                            : `task:${t.id}`,
                      )
                    }
                  >
                    <b>{t.title}</b>
                    <small>
                      {person(state, t.performerId)} ·{" "}
                      {taskDone(t) ? "Завершено" : dateLabel(t.due)}
                    </small>
                  </button>
                ))}
              </div>
              {!closed && ["quality", "manager"].includes(user.role) && (
                <button onClick={() => onSection("immediate")}>
                  <Plus size={16} /> Первичная мера / уточнение
                </button>
              )}
            </details>
            <details>
              <summary>Комментарии · {item.comments.length}</summary>
              {item.comments.map((c) => (
                <div className="history-item" key={c.id}>
                  <b>{person(state, c.authorId)}</b>
                  <small>
                    {c.at
                      ? dateLabel(c.at, true)
                      : `${c.legacyTime || "Нет даты"} · прежний текст даты`}
                  </small>
                  <p>{c.text}</p>
                </div>
              ))}
              {!closed && (
                <CommentForm
                  key={`${item.id}:${item.revision}`}
                  item={item}
                  onDirty={onDirty}
                />
              )}
            </details>
            <details>
              <summary>Ход дела и интервалы этапов</summary>
              <p className="hint">
                Текущий этап: {stageLabels[item.stage]}. Ниже — фактические
                переходы, включая возвраты.
              </p>
              <ol className="process-route">
                {(
                  [
                    "assessment",
                    "investigation",
                    "plan",
                    "execution",
                    "acceptance",
                    "effectiveness",
                    "closure",
                    "closed",
                  ] as Stage[]
                ).map((stage) => (
                  <li
                    key={stage}
                    aria-current={item.stage === stage ? "step" : undefined}
                    className={
                      item.stage === stage
                        ? "current"
                        : item.stageIntervals.some((i) => i.value === stage)
                          ? "visited"
                          : ""
                    }
                  >
                    {stageLabels[stage]}
                    <small>
                      {item.stage === stage
                        ? "Сейчас"
                        : item.stageIntervals.some((i) => i.value === stage)
                          ? "Есть в истории"
                          : "Нет перехода"}
                    </small>
                  </li>
                ))}
              </ol>
              {item.stageIntervals.length ? (
                item.stageIntervals.map((v, i) => (
                  <p key={i}>
                    {stageLabels[v.value as Stage]} · {dateLabel(v.start, true)}{" "}
                    · {duration(hours(v.start, v.end || now))}
                  </p>
                ))
              ) : (
                <p className="muted">Нет исходных временных меток</p>
              )}
            </details>
            {closed && (
              <button onClick={onRepeat}>
                Зарегистрировать повторное событие
              </button>
            )}
          </>
        ) : section === "documents" ? (
          <Documents key={`${item.id}:${item.revision}`} {...formProps} />
        ) : section === "history" ? (
          <>
            <h3>История дела</h3>
            {!events.length && (
              <p className="muted">События прежней записи неизвестны.</p>
            )}
            {[...events].reverse().map((e) => (
              <details className="history-item" key={e.id}>
                <summary>
                  {e.label}
                  <small>
                    {dateLabel(e.recordedAt, true)} · {person(state, e.actorId)}
                  </small>
                </summary>
                <p>{e.reason}</p>
                {e.occurredAt !== e.recordedAt && (
                  <p>
                    Фактически: {dateLabel(e.occurredAt, true)} · внесено:{" "}
                    {dateLabel(e.recordedAt, true)}
                  </p>
                )}
                <button
                  onClick={() =>
                    download(
                      new Blob([JSON.stringify(e, null, 2)], {
                        type: "application/json",
                      }),
                      `pharmaq-event-${e.seq}.json`,
                    )
                  }
                >
                  <Download size={15} /> Детали изменения
                </button>
              </details>
            ))}
            <p className="hint">
              Локальная история приложения. Она не является защищённой
              электронной подписью.
            </p>
          </>
        ) : (
          <>
            <button className="back" onClick={() => onSection("overview")}>
              <ArrowLeft size={16} /> К обзору
            </button>
            <h3 className="form-title">
              {task ? "Задание" : sectionTitles[section]}
            </h3>
            {closed && task ? (
              <TaskForm {...formProps} task={task} />
            ) : closed ? (
              <ReadOnly item={item} section={section} />
            ) : (
              <div key={`${item.id}:${section}:${item.revision}`}>
                {section === "assessment" ? (
                  <AssessmentForm {...formProps} />
                ) : section === "investigation" ? (
                  <InvestigationForm {...formProps} />
                ) : section === "plan" ? (
                  <PlanForm {...formProps} />
                ) : task ? (
                  <TaskForm {...formProps} task={task} />
                ) : section === "external" ? (
                  <ExternalForm {...formProps} />
                ) : section === "closure" ? (
                  <ClosureForm {...formProps} go={onSection} />
                ) : section === "legacy" ? (
                  <LegacyForm {...formProps} />
                ) : section === "immediate" ? (
                  <ImmediateForm {...formProps} />
                ) : (
                  <DetailsForm {...formProps} />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
function CommentForm({
  item,
  onDirty,
}: Pick<CaseFormProps, "item" | "onDirty">) {
  const { state, run } = useApp();
  const [revision] = useState(state.revision);
  const [text, setText] = useState("");
  return (
    <Form
      label="Добавить комментарий"
      onDirty={onDirty}
      submit={async () => {
        await run("comment", { text }, item.id, undefined, revision);
        setText("");
      }}
    >
      <Field label="Комментарий">
        <textarea
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
    </Form>
  );
}
function Documents({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, run, repository, toast } = useApp();
  const [revision] = useState(state.revision);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    type: string;
  }>();
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const docs = state.documents.filter((d) => d.caseId === item.id);
  return (
    <>
      <div className="document-list">
        {docs.map((d) => (
          <article key={d.id}>
            <FileText size={20} />
            <div>
              <b>
                {d.name} <span className="count">v{d.version}</span>
              </b>
              <small>
                {Math.ceil(d.size / 1024)} КБ · {dateLabel(d.uploadedAt, true)}
              </small>
              <small>
                Автор: {d.source} · внёс {person(state, d.uploadedBy)}
              </small>
              {d.taskId && (
                <small>
                  Задание: {item.tasks.find((t) => t.id === d.taskId)?.title}
                </small>
              )}
            </div>
            {[
              "application/pdf",
              "text/plain",
              "text/csv",
              "image/png",
              "image/jpeg",
              "image/webp",
            ].includes(d.type) && (
              <button
                aria-label={`Просмотр ${d.name}`}
                className="quiet"
                onClick={async () => {
                  try {
                    const blob = await repository.file(d.id);
                    setPreview({
                      url: URL.createObjectURL(blob),
                      name: d.name,
                      type: d.type,
                    });
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                Просмотр
              </button>
            )}
            <button
              className="icon"
              aria-label={`Скачать ${d.name}`}
              onClick={async () => {
                try {
                  download(await repository.file(d.id), d.name);
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Download size={17} />
            </button>
          </article>
        ))}
      </div>
      {!docs.length && <p className="muted">Документы ещё не добавлены.</p>}
      {preview && (
        <Dialog title={preview.name} wide onClose={() => setPreview(undefined)}>
          {preview.type.startsWith("image/") ? (
            <img
              className="document-preview"
              src={preview.url}
              alt={preview.name}
            />
          ) : (
            <iframe
              className="document-preview"
              src={preview.url}
              title={preview.name}
              sandbox=""
            />
          )}
        </Dialog>
      )}
      {!isClosed(item) && user.role !== "admin" && (
        <details open={!docs.length}>
          <summary>Добавить документы</summary>
          <Form
            label="Сохранить файлы"
            onDirty={onDirty}
            submit={async (f) => {
              if (!files.length) throw new Error("Выберите хотя бы один файл");
              if (value(f, "previousId") && files.length !== 1)
                throw new Error("Для новой версии выберите один файл");
              const prepared = prepareFiles(
                files,
                value(f, "source"),
                value(f, "occurredAt")
                  ? inputISO(value(f, "occurredAt"))
                  : new Date().toISOString(),
                {
                  taskId: value(f, "taskId") || undefined,
                  decisionId: value(f, "decisionId") || undefined,
                  previousId: value(f, "previousId") || undefined,
                },
              );
              await run(
                "attach",
                { documents: prepared.documents },
                item.id,
                undefined,
                revision,
                prepared.uploads,
              );
              onDone();
            }}
          >
            <Field label="Автор / источник *">
              <input name="source" required defaultValue={user.name} />
            </Field>
            <Field label="Дата документа (пусто — сейчас)">
              <input name="occurredAt" type="datetime-local" />
            </Field>
            <Field label="Связанное задание">
              <select name="taskId">
                <option value="">Материалы дела</option>
                {item.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Связанное внешнее решение">
              <select name="decisionId">
                <option value="">Не связано</option>
                {item.externalDecisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.subject}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Новая версия документа">
              <select name="previousId">
                <option value="">Новый документ</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · v{d.version}
                  </option>
                ))}
              </select>
            </Field>
            <FilePicker
              files={files}
              setFiles={(v) => {
                setFiles(v);
                onDirty(true);
              }}
            />
          </Form>
        </details>
      )}
    </>
  );
}
function ReadOnly({ item, section }: { item: Deviation; section: string }) {
  const { state, open } = useApp();
  return (
    <>
      <p className="hint">Дело завершено и доступно только для чтения.</p>
      {section === "assessment" ? (
        item.assessments.map((a, n) => (
          <div key={n}>
            <b>{a.category}</b>
            <p>{a.reason}</p>
            <p>{a.scope}</p>
            <p>
              {a.impact} · {a.safety}
            </p>
            <p>
              Участники:{" "}
              {a.participants.map((id) => person(state, id)).join(", ")}
            </p>
            <p>
              Руководитель: {person(state, a.leadId)} · срок{" "}
              {dateLabel(a.due, true)}
            </p>
            <p>{a.revisionReason}</p>
            <p>
              {a.objects
                ?.map((o) =>
                  [o.name, o.batch, o.supplierBatch]
                    .filter(Boolean)
                    .join(" · "),
                )
                .join("; ")}
            </p>
          </div>
        ))
      ) : section === "investigation" ? (
        item.investigations.map((i) => (
          <div key={i.revision}>
            <b>Вывод v{i.revision}</b>
            <p>{i.conclusion}</p>
            <p>{i.cause || i.uncertainty}</p>
            <p>{i.qualityDecision}</p>
            <details>
              <summary>Материалы вывода</summary>
              <p>{i.facts}</p>
              <p>{i.chronology}</p>
              <p>{i.hypotheses}</p>
              <p>{i.evidence}</p>
              <p>{i.method}</p>
              {i.why.map((v, n) => (
                <p key={n}>{v}</p>
              ))}
              <p>{i.uncertainty}</p>
              <p>{i.revisionReason}</p>
              <p>
                Участники:{" "}
                {i.participants.map((id) => person(state, id)).join(", ")}
              </p>
            </details>
          </div>
        ))
      ) : section === "plan" ? (
        <>
          {item.noMeasures && <p>Без мер: {item.noMeasures.reason}</p>}
          {item.plans.map((p) => (
            <details
              key={p.version}
              open={p.version === item.activePlanVersion}
            >
              <summary>
                Версия {p.version} ·{" "}
                {p.status === "approved" ? "Утверждена" : "Не действует"}
              </summary>
              <p>{p.reason}</p>
              {p.decisions.map((d, n) => (
                <p key={n}>
                  {person(state, d.actorId)} · {dateLabel(d.at, true)}:{" "}
                  {d.reason}
                </p>
              ))}
              <div className="compact-list">
                {p.tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => open(item.id, `task:${t.id}`)}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </>
      ) : section === "external" ? (
        <ExternalForm item={item} onDone={() => {}} onDirty={() => {}} />
      ) : section === "closure" ? (
        <p>{item.closureReason || "Основание прежней записи неизвестно"}</p>
      ) : (
        <DetailsRead item={item} />
      )}
    </>
  );
}
function DetailsRead({ item }: { item: Deviation }) {
  const { state, now } = useApp();
  return (
    <>
      <dl className="metadata">
        {[
          ["Автор", person(state, item.authorId)],
          [
            "Обнаружено",
            item.detectedAt
              ? dateLabel(item.detectedAt, true)
              : "Нет точного времени",
          ],
          [
            "Зарегистрировано",
            item.registeredAt
              ? dateLabel(item.registeredAt, true)
              : "Нет точного времени",
          ],
          ["Подразделение", item.department],
          ["Участок / линия", item.line],
          ["Зона", item.area],
          ["Место", item.place],
          ["Обнаружил", item.detector],
          ["Ожидаемый процесс", item.expected],
          ["Фактическая ситуация", item.actual],
          ["Первичные меры", item.immediateActions],
          ["Влияние на продукцию", item.impact],
          ["Безопасность", item.safety],
          ["Количество", item.amount],
        ].map(([key, val]) => (
          <div className="metadata-group" key={key}>
            <dt>{key}</dt>
            <dd>{val || "Не указано"}</dd>
          </div>
        ))}
      </dl>
      <p className="long-text">{item.description}</p>
      {item.objects.map((o) => (
        <details key={o.id}>
          <summary>{o.name}</summary>
          <dl className="metadata">
            {[
              ["Серия", o.batch],
              ["Код", o.code],
              ["Партия поставщика", o.supplierBatch],
              ["Количество", o.quantity],
              ["Заказ", o.order],
              ["Стадия", o.productionStage],
            ].map(([k, v]) => (
              <div className="metadata-group" key={k}>
                <dt>{k}</dt>
                <dd>{v || "Не указано"}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      <details>
        <summary>Время у ответственных</summary>
        {item.ownerIntervals.map((v, i) => (
          <p key={i}>
            {person(state, v.value)} ·{" "}
            {duration(hours(v.start, v.end || item.closedAt || now))}
          </p>
        ))}
      </details>
      {item.legacy && (
        <details>
          <summary>Исходные сведения</summary>
          {item.legacy.notes.map((v) => (
            <p key={v}>{v}</p>
          ))}
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(item.legacy!.raw, null, 2)], {
                  type: "application/json",
                }),
                `${item.number}-legacy.json`,
              )
            }
          >
            Скачать исходную запись
          </button>
        </details>
      )}
    </>
  );
}
function DetailsForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, run, confirmNavigation } = useApp();
  const [revision] = useState(state.revision);
  const [action, setAction] = useState<CommandType>("reschedule");
  const actions: [CommandType, string][] = [];
  if (user.role === "quality")
    actions.push(
      ["reschedule", "Перенести срок дела"],
      ["correct_time", "Исправить время обнаружения"],
    );
  if (user.id === item.coordinatorId || user.role === "manager")
    actions.push(["request_transfer", "Передать дело"]);
  if (user.role === "manager")
    actions.push(["force_transfer", "Принудительная передача"]);
  if (item.ownerTransfers.some((t) => !t.decision && t.toId === user.id))
    actions.push(["decide_transfer", "Решение по передаче"]);
  const selected = actions.some((x) => x[0] === action)
    ? action
    : actions[0]?.[0];
  return (
    <>
      <DetailsRead item={item} />
      {actions.length > 0 && (
        <details>
          <summary>Изменить срок / ответственность / время</summary>
          <Field label="Действие">
            <select
              value={selected}
              onChange={(e) => {
                const action = e.target.value as CommandType;
                confirmNavigation(() => {
                  setAction(action);
                  onDirty(false);
                });
              }}
            >
              {actions.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Form
            key={selected}
            label="Сохранить решение"
            onDirty={onDirty}
            submit={async (f) => {
              const data: Record<string, unknown> = {
                reason: value(f, "reason"),
              };
              if (selected === "reschedule")
                data.due = inputISO(value(f, "due"));
              if (selected === "correct_time") {
                data.field = "detectedAt";
                data.value = inputISO(value(f, "value"));
              }
              if (
                selected === "request_transfer" ||
                selected === "force_transfer"
              )
                data.toId = value(f, "toId");
              if (selected === "decide_transfer")
                data.decision = value(f, "decision");
              await run(selected, data, item.id, undefined, revision);
              onDone();
            }}
          >
            {selected === "reschedule" && (
              <Field label="Новый срок *">
                <input
                  name="due"
                  type="datetime-local"
                  required
                  defaultValue={localInput(item.due)}
                />
              </Field>
            )}
            {selected === "correct_time" && (
              <Field label="Время обнаружения *">
                <input
                  name="value"
                  type="datetime-local"
                  required
                  defaultValue={localInput(item.detectedAt)}
                />
              </Field>
            )}
            {["request_transfer", "force_transfer"].includes(selected) && (
              <Field label="Новый координатор">
                <PeopleSelect name="toId" quality />
              </Field>
            )}
            {selected === "decide_transfer" && (
              <Field label="Решение">
                <select name="decision">
                  <option value="accepted">Подтвердить</option>
                  <option value="rejected">Отказаться</option>
                </select>
              </Field>
            )}
            <Field label="Основание *">
              <textarea name="reason" required />
            </Field>
          </Form>
        </details>
      )}
    </>
  );
}
function ExternalForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, run } = useApp();
  const [revision] = useState(state.revision);
  return (
    <>
      <p className="hint">
        Здесь фиксируется решение уполномоченного человека. Приложение не
        разрешает выпуск или использование продукции.
      </p>
      {item.externalDecisions.map((d) => (
        <details key={d.id} open={d.state === "pending"}>
          <summary>
            {d.subject} · {d.state === "recorded" ? "Получено" : "Ожидается"}
          </summary>
          <p>
            {d.type} · {d.responsible} ·{" "}
            {d.required ? "Обязательно для закрытия" : "Необязательное"}
          </p>
          {d.state === "recorded" ? (
            <>
              <p>{d.result}</p>
              <p>
                {d.reference} · {d.author} · {dateLabel(d.decidedAt, true)}
              </p>
            </>
          ) : (
            !isClosed(item) &&
            user.role === "quality" && (
              <Form
                label="Зарегистрировать внешнее решение"
                onDirty={onDirty}
                submit={async (f) => {
                  await run(
                    "record_decision",
                    {
                      decisionId: d.id,
                      reference: value(f, "reference"),
                      author: value(f, "author"),
                      result: value(f, "result"),
                      decidedAt: inputISO(value(f, "decidedAt")),
                    },
                    item.id,
                    undefined,
                    revision,
                  );
                  onDone();
                }}
              >
                <Field label="Содержание внешнего решения *">
                  <textarea name="result" required />
                </Field>
                <Field label="Номер / ссылка на документ *">
                  <input name="reference" required />
                </Field>
                <Field label="Автор решения *">
                  <input name="author" required />
                </Field>
                <Field label="Дата решения *">
                  <input name="decidedAt" type="datetime-local" required />
                </Field>
              </Form>
            )
          )}
        </details>
      ))}
      {!isClosed(item) && user.role === "quality" && (
        <details>
          <summary>Добавить необходимое решение</summary>
          <Form
            label="Добавить внешнее решение"
            onDirty={onDirty}
            submit={async (f) => {
              await run(
                "require_decision",
                {
                  subject: value(f, "subject"),
                  decisionType: value(f, "decisionType"),
                  responsible: value(f, "responsible"),
                  required: value(f, "required") === "yes",
                },
                item.id,
                undefined,
                revision,
              );
              onDone();
            }}
          >
            {[
              ["subject", "Объект решения"],
              ["decisionType", "Тип решения"],
              ["responsible", "Внешний ответственный"],
            ].map(([name, label]) => (
              <Field label={`${label} *`} key={name}>
                <input name={name} required />
              </Field>
            ))}
            <Field label="Обязательность">
              <select name="required">
                <option value="yes">Обязательно для закрытия</option>
                <option value="no">Необязательное</option>
              </select>
            </Field>
          </Form>
        </details>
      )}
    </>
  );
}
function ClosureForm({
  item,
  onDone,
  onDirty,
  go,
}: CaseFormProps & { go: (section: string) => void }) {
  const { state, user, run } = useApp();
  const [revision] = useState(state.revision);
  const [action, setAction] = useState("close");
  const errors = closureProblems(item);
  return (
    <>
      <h3>Условия закрытия</h3>
      {errors.length ? (
        <div className="blockers">
          {errors.map((x, i) => (
            <button key={i} onClick={() => go(x.section)}>
              {x.label}
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <p className="success-text">Обязательные условия выполнены.</p>
      )}
      {user.role === "quality" ? (
        <Form
          label={
            action === "close" ? "Закрыть отклонение" : "Зафиксировать решение"
          }
          onDirty={onDirty}
          submit={async (f) => {
            await run(
              action === "close"
                ? "close"
                : action === "no_measures"
                  ? "no_measures"
                  : "dispose",
              {
                reason: value(f, "reason"),
                route: action,
                relatedCaseId: value(f, "relatedCaseId"),
              },
              item.id,
              undefined,
              revision,
            );
            onDone();
          }}
        >
          <Field label="Маршрут">
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="close">Обычное закрытие</option>
              <option value="no_measures">Обоснованный маршрут без мер</option>
              <option value="duplicate">Дубль другого дела</option>
              <option value="out_of_scope">Вне области отклонений</option>
            </select>
          </Field>
          {action === "duplicate" && (
            <Field label="Основное дело">
              <select name="relatedCaseId" required>
                <option value="">Выберите дело</option>
                {state.cases
                  .filter((c) => c.id !== item.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number} · {c.title}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Основание решения *">
            <textarea name="reason" required />
          </Field>
          <p className="hint">
            Закрытие переводит дело в режим чтения. Система повторно проверит
            обязательства.
          </p>
        </Form>
      ) : (
        <p className="hint">
          Закрывает дело уполномоченный качества. Ваша роль не даёт этого права.
        </p>
      )}
    </>
  );
}
function LegacyForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, run } = useApp();
  const [revision] = useState(state.revision);
  return (
    <>
      {item.legacy?.notes.map((n) => (
        <p className="hint" key={n}>
          {n}
        </p>
      ))}
      {user.role === "quality" && (
        <Form
          label="Направить на уточнённую оценку"
          onDirty={onDirty}
          submit={async (f) => {
            await run(
              "clarify_legacy",
              {
                coordinatorId: value(f, "coordinatorId"),
                reason: value(f, "reason"),
              },
              item.id,
              undefined,
              revision,
            );
            onDone();
          }}
        >
          <Field label="Координатор качества">
            <PeopleSelect
              name="coordinatorId"
              quality
              value={state.settings.coordinatorId}
            />
          </Field>
          <Field label="Основание уточнения *">
            <textarea name="reason" required />
          </Field>
          <p className="hint">
            Прежний этап и материалы сохранятся. Новые события начнут
            учитываться с текущего момента.
          </p>
        </Form>
      )}
    </>
  );
}
function ImmediateForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, now, run } = useApp();
  const [revision] = useState(state.revision);
  return (
    <Form
      label="Назначить задание"
      onDirty={onDirty}
      submit={async (f) => {
        const task: TaskSpec = {
          id: uid(),
          measureId: "",
          kind: value(f, "kind") as "immediate" | "clarification",
          title: value(f, "title"),
          outcome: value(f, "outcome"),
          ownerId: value(f, "ownerId"),
          performerId: value(f, "performerId"),
          reviewerId: value(f, "reviewerId"),
          due: inputISO(value(f, "due")),
          criteria: value(f, "criteria"),
          requiredEvidence: value(f, "requiredEvidence"),
          required: true,
          dependencies: [],
          observationHours: 0,
          method: "",
        };
        await run("add_task", { task }, item.id, undefined, revision);
        onDone();
      }}
    >
      <Field label="Тип">
        <select name="kind">
          <option value="immediate">Первичная мера</option>
          <option value="clarification">
            Уточнение / исследовательское задание
          </option>
        </select>
      </Field>
      {[
        ["title", "Действие"],
        ["outcome", "Ожидаемый результат"],
        ["criteria", "Критерии приёмки"],
        ["requiredEvidence", "Требуемые доказательства"],
      ].map(([name, label]) => (
        <Field key={name} label={`${label} *`}>
          <input name={name} required />
        </Field>
      ))}
      {[
        ["ownerId", "Ответственный"],
        ["performerId", "Исполнитель"],
        ["reviewerId", "Принимающий"],
      ].map(([name, label]) => (
        <Field key={name} label={label}>
          <PeopleSelect name={name} manager={name === "reviewerId"} />
        </Field>
      ))}
      <Field label="Срок *">
        <input
          name="due"
          type="datetime-local"
          required
          defaultValue={localInput(
            new Date(Date.parse(now) + DAY).toISOString(),
          )}
        />
      </Field>
    </Form>
  );
}
