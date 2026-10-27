"use client";
import { useState } from "react";
import { CaseFormProps } from "./case-forms";
import { CommandType, Permit, Task, statusLabels } from "../lib/domain/types";
import { person, taskDone, isClosed } from "../lib/domain/permissions";
import { contractorProblems, readyProblems, uid } from "../lib/domain/helpers";
import {
  dateLabel,
  duration,
  hours,
  inputISO,
  localInput,
  DAY,
} from "../lib/domain/time";
import { useApp } from "./context";
import { Field, Form, PeopleSelect, value } from "./forms";
export function TaskForm({
  item,
  task,
  onDone,
  onDirty,
}: CaseFormProps & { task: Task }) {
  const { state, user, now, run, confirmNavigation } = useApp();
  const [revision] = useState(state.revision);
  const manager = user.role === "manager",
    quality = user.role === "quality",
    owner = task.ownerId === user.id || manager,
    performer = task.performerId === user.id;
  const options: [CommandType, string][] = [];
  if (!taskDone(task) && !isClosed(item)) {
    if (performer && task.status === "assigned")
      options.push(
        ["accept_assignment", "Принять назначение"],
        ["decline_assignment", "Отказаться от назначения"],
      );
    if (performer && ["ready", "rework"].includes(task.status))
      options.push(["start_task", "Начать работу"]);
    if (performer && task.status === "in_progress")
      options.push(["submit_task", "Сдать результат"]);
    if (
      user.id === task.reviewerId &&
      user.id !== task.performerId &&
      task.status === "submitted"
    )
      options.push(["review_task", "Принять или вернуть результат"]);
    if (owner && ["ready", "in_progress", "rework"].includes(task.status))
      options.push(["wait_task", "Перевести в ожидание"]);
    if (owner && task.status === "waiting")
      options.push(["resume_task", "Возобновить работу"]);
    if (owner && !task.transfers.some((t) => !t.decision))
      options.push(["request_transfer", "Запросить передачу ответственности"]);
    if (manager && !task.transfers.some((t) => !t.decision))
      options.push([
        "force_transfer",
        "Передать ответственность решением руководителя",
      ]);
    if (task.transfers.some((t) => !t.decision && t.toId === user.id))
      options.push(["decide_transfer", "Решение по входящей передаче"]);
    if (manager || quality)
      options.push([
        "replace_assignment",
        "Заменить исполнителя / принимающего",
      ]);
    if (quality || (manager && task.kind !== "effectiveness"))
      options.push(["reschedule", "Перенести срок"]);
    if (owner) options.push(["annotate_task", "Добавить уточнение"]);
    if (quality && ["immediate", "clarification"].includes(task.kind))
      options.push(["cancel_task", "Отменить дополнительное задание"]);
    if (task.contractor) {
      if (owner)
        options.push(
          ["contractor_permits", "Внести документы допуска"],
          ["contractor_event", "Событие подрядчика"],
        );
      if (quality)
        options.push(["approve_contractor", "Одобрить допуск к работе"]);
      if (manager || quality)
        options.push(["replace_contractor", "Заменить подрядчика"]);
    }
  }
  if (quality && task.attempts.length && !isClosed(item))
    options.push(["correct_time", "Исправить фактическое время"]);
  const [action, setAction] = useState<CommandType>(
    options[0]?.[0] || "annotate_task",
  );
  const [permits, setPermits] = useState<Permit[]>(
    task.contractor?.permits.length
      ? structuredClone(task.contractor.permits)
      : task.contractor?.requirements.map((scope) => ({
          id: uid(),
          scope,
          zone: task.contractor!.zone,
          people: task.contractor!.people,
          tools: task.contractor!.tools,
          expiresAt: new Date(Date.parse(now) + 30 * DAY).toISOString(),
          reference: "",
        })) || [],
  );
  const wait = task.waits.at(-1),
    problems = readyProblems(item, task, now);
  return (
    <>
      <div className="task-heading">
        <h3>{task.title}</h3>
        <span className={`status ${task.status}`}>
          {statusLabels[task.status]}
        </span>
      </div>
      <dl className="metadata">
        <dt>Ответственный</dt>
        <dd>{person(state, task.ownerId)}</dd>
        <dt>Исполнитель</dt>
        <dd>{person(state, task.performerId)}</dd>
        <dt>Принимающий</dt>
        <dd>{person(state, task.reviewerId)}</dd>
        <dt>Срок</dt>
        <dd>{dateLabel(task.due, true)}</dd>
        <dt>Исходный срок</dt>
        <dd>{dateLabel(task.originalDue, true)}</dd>
        <dt>Назначено</dt>
        <dd>
          {task.createdAt
            ? `${duration(hours(task.createdAt, now))} назад`
            : "Нет данных"}
        </dd>
        <dt>Ожидаемый результат</dt>
        <dd>{task.outcome || "Требует уточнения"}</dd>
        <dt>Критерии приёмки</dt>
        <dd>{task.criteria || "Требуют уточнения"}</dd>
        <dt>Доказательства</dt>
        <dd>{task.requiredEvidence || "Требуют уточнения"}</dd>
      </dl>
      {task.kind === "effectiveness" && (
        <div className="hint">
          Метод: {task.method}. Наблюдение после приёмки:{" "}
          {task.observationHours} ч.{" "}
          {task.notBefore && `Не раньше ${dateLabel(task.notBefore, true)}.`}
        </div>
      )}
      {problems.length > 0 && !taskDone(task) && (
        <div className="hint">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
      {task.status === "waiting" && wait && (
        <div className="hint">
          <b>Ожидание: {wait.reason}</b>
          <p>
            {wait.dependency} · {person(state, wait.ownerId)}
          </p>
          <p>
            Контроль: {dateLabel(wait.reviewAt, true)} · длительность{" "}
            {duration(hours(wait.start, now))}
          </p>
        </div>
      )}
      {task.transfers
        .filter((t) => !t.decision)
        .map((t) => (
          <p className="hint" key={t.id}>
            До подтверждения {person(state, t.toId)} отвечает{" "}
            {person(state, t.fromId)}. Причина: {t.reason}
          </p>
        ))}
      {task.contractor && (
        <details>
          <summary>
            Внешняя работа ·{" "}
            {
              state.contractors.find(
                (x) => x.id === task.contractor!.contractorId,
              )?.name
            }
          </summary>
          <dl className="metadata">
            <dt>Объём</dt>
            <dd>{task.contractor.scope}</dd>
            <dt>Зона</dt>
            <dd>{task.contractor.zone}</dd>
            <dt>Люди / инструменты</dt>
            <dd>
              {task.contractor.people} · {task.contractor.tools}
            </dd>
            <dt>Допуски</dt>
            <dd>
              {contractorProblems(task.contractor, now).join("; ") ||
                "Действуют для этой работы"}
            </dd>
            <dt>Вызов</dt>
            <dd>{dateLabel(task.contractor.calledAt, true)}</dd>
            <dt>Прибытие</dt>
            <dd>{dateLabel(task.contractor.arrivedAt, true)}</dd>
          </dl>
          {task.contractor.events.map((e, i) => (
            <p key={i}>
              {dateLabel(e.at, true)} ·{" "}
              {
                (
                  {
                    called: "Вызов",
                    arrived: "Прибытие",
                    no_show: "Неявка",
                    refused: "Отказ",
                    suspended: "Приостановка",
                    replaced: "Замена",
                  } as Record<string, string>
                )[e.type]
              }{" "}
              · {e.reason}
            </p>
          ))}
        </details>
      )}
      {options.length > 0 ? (
        <>
          <Field label="Действие">
            <select
              value={action}
              onChange={(e) => {
                const next = e.target.value as CommandType;
                confirmNavigation(() => {
                  setAction(next);
                  onDirty(false);
                });
              }}
            >
              {options.map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          </Field>
          <Form
            key={action}
            label={options.find((x) => x[0] === action)?.[1]}
            onDirty={onDirty}
            submit={async (f) => {
              const data: Record<string, unknown> = {};
              for (const [key, val] of f.entries()) data[key] = val;
              if (data.reviewAt)
                data.reviewAt = inputISO(String(data.reviewAt));
              if (data.due) data.due = inputISO(String(data.due));
              if (action === "correct_time" && data.value)
                data.value = inputISO(String(data.value));
              if (action === "submit_task")
                data.documentIds = f.getAll("documentIds");
              if (action === "contractor_permits") data.permits = permits;
              const occurredAt = value(f, "occurredAt")
                ? inputISO(value(f, "occurredAt"))
                : undefined;
              delete data.occurredAt;
              await run(
                action,
                data,
                item.id,
                task.id,
                revision,
                [],
                occurredAt,
              );
              onDone();
            }}
          >
            {["start_task", "submit_task", "contractor_event"].includes(
              action,
            ) && (
              <Field label="Фактическое время (пусто — сейчас)">
                <input name="occurredAt" type="datetime-local" />
              </Field>
            )}
            {action === "submit_task" && (
              <>
                <Field label="Результат и доказательства *">
                  <textarea name="evidence" required rows={3} />
                </Field>
                <Field label="Автор / источник подтверждения *">
                  <input
                    name="source"
                    required
                    defaultValue={
                      task.contractor
                        ? state.contractors.find(
                            (v) => v.id === task.contractor!.contractorId,
                          )?.name
                        : user.name
                    }
                  />
                </Field>
                <Field label="Документы дела">
                  <select name="documentIds" multiple>
                    {state.documents
                      .filter((d) => d.caseId === item.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · v{d.version}
                        </option>
                      ))}
                  </select>
                </Field>
                <p className="hint">
                  Файлы можно добавить на вкладке «Документы». Текст
                  доказательства также сохраняется в попытке.
                </p>
              </>
            )}
            {action === "review_task" && (
              <Field label="Решение">
                <select name="decision">
                  <option value="accepted">Принять результат</option>
                  <option value="deficient">
                    Вернуть: работа выполнена неправильно
                  </option>
                  {task.kind === "effectiveness" && (
                    <option value="ineffective">
                      Эффект не подтверждён: пересмотреть расследование
                    </option>
                  )}
                </select>
              </Field>
            )}
            {action === "wait_task" && (
              <div className="form-grid">
                <Field label="Ожидаемый результат / зависимость *" wide>
                  <input name="dependency" required />
                </Field>
                <Field label="Кто получит результат">
                  <PeopleSelect name="ownerId" value={task.ownerId} />
                </Field>
                <Field label="Дата контроля *">
                  <input
                    name="reviewAt"
                    type="datetime-local"
                    required
                    defaultValue={localInput(
                      new Date(Date.parse(now) + DAY).toISOString(),
                    )}
                  />
                </Field>
              </div>
            )}
            {[
              "request_transfer",
              "force_transfer",
              "replace_assignment",
            ].includes(action) && (
              <Field label="Новый участник">
                <PeopleSelect name="toId" />
              </Field>
            )}
            {action === "replace_assignment" && (
              <Field label="Назначение">
                <select name="function">
                  <option value="performerId">Исполнитель</option>
                  <option value="reviewerId">Принимающий</option>
                </select>
              </Field>
            )}
            {action === "decide_transfer" && (
              <Field label="Решение">
                <select name="decision">
                  <option value="accepted">Подтвердить передачу</option>
                  <option value="rejected">Отказаться с основанием</option>
                </select>
              </Field>
            )}
            {action === "reschedule" && (
              <Field label="Новый срок *">
                <input
                  name="due"
                  type="datetime-local"
                  required
                  defaultValue={localInput(task.due)}
                />
              </Field>
            )}
            {action === "annotate_task" && (
              <Field label="Уточнение (не меняет критерии) *">
                <textarea name="note" required />
              </Field>
            )}
            {action === "correct_time" && (
              <>
                <Field label="Попытка">
                  <select name="attemptId">
                    {task.attempts.map((a, i) => (
                      <option key={a.id} value={a.id}>
                        Попытка {i + 1}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Событие">
                  <select name="field">
                    <option value="startedAt">Начало</option>
                    <option value="finishedAt">Фактическое окончание</option>
                  </select>
                </Field>
                <Field label="Исправленное время *">
                  <input name="value" type="datetime-local" required />
                </Field>
              </>
            )}
            {action === "contractor_event" && (
              <Field label="Событие">
                <select name="event">
                  <option value="called">Вызов</option>
                  <option value="arrived">Прибытие</option>
                  <option value="no_show">Неявка</option>
                  <option value="refused">Отказ</option>
                  <option value="suspended">Приостановка</option>
                </select>
              </Field>
            )}
            {action === "replace_contractor" && (
              <Field label="Новый подрядчик">
                <select name="contractorId">
                  {state.contractors
                    .filter((v) => v.active)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {action === "contractor_permits" &&
              permits.map((p, i) => (
                <fieldset key={p.id}>
                  <legend>{p.scope}</legend>
                  <div className="form-grid">
                    {(["zone", "people", "tools", "reference"] as const).map(
                      (key, n) => (
                        <Field
                          key={key}
                          label={
                            [
                              "Зона",
                              "Специалисты",
                              "Инструменты",
                              "Документ / ссылка",
                            ][n]
                          }
                        >
                          <input
                            value={p[key]}
                            required={key === "reference"}
                            onChange={(e) =>
                              setPermits(
                                permits.map((x, j) =>
                                  j === i ? { ...x, [key]: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      ),
                    )}
                    <Field label="Действует до *">
                      <input
                        type="datetime-local"
                        required
                        value={localInput(p.expiresAt)}
                        onChange={(e) =>
                          setPermits(
                            permits.map((x, j) =>
                              j === i
                                ? { ...x, expiresAt: inputISO(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                </fieldset>
              ))}
            {![
              "accept_assignment",
              "start_task",
              "submit_task",
              "resume_task",
              "contractor_permits",
            ].includes(action) && (
              <Field
                label={
                  action === "review_task"
                    ? "Основание / конкретные замечания *"
                    : "Основание *"
                }
              >
                <textarea name="reason" required />
              </Field>
            )}
            {action === "start_task" && (
              <p className="hint">
                Будут проверены зависимости, период наблюдения и действующие
                допуски.
              </p>
            )}
          </Form>
        </>
      ) : (
        <p className="hint">
          {taskDone(task)
            ? "Результат сохранён. Изменение принятой работы требует новой связанной меры."
            : "Для вашей роли и назначения сейчас нет доступных действий."}
        </p>
      )}
      <details>
        <summary>Попытки и приёмка · {task.attempts.length}</summary>
        {task.attempts.map((a, i) => (
          <div className="history-item" key={a.id}>
            <b>Попытка {i + 1}</b>
            <dl className="metadata">
              <dt>Начало</dt>
              <dd>{dateLabel(a.startedAt, true)}</dd>
              <dt>Завершение</dt>
              <dd>
                {a.finishedAt ? dateLabel(a.finishedAt, true) : "Не завершено"}
              </dd>
              <dt>Передано на проверку</dt>
              <dd>
                {a.submittedAt ? dateLabel(a.submittedAt, true) : "Не сдано"}
              </dd>
              <dt>Выполнение</dt>
              <dd>{duration(hours(a.startedAt, a.finishedAt || now))}</dd>
              <dt>Проверка</dt>
              <dd>{duration(hours(a.submittedAt, a.reviewedAt || now))}</dd>
              <dt>Источник</dt>
              <dd>{a.source || "—"}</dd>
              <dt>Внёс</dt>
              <dd>{a.uploadedBy ? person(state, a.uploadedBy) : "—"}</dd>
            </dl>
            <p>{a.evidence}</p>
            <p>
              {a.decision
                ? {
                    accepted: "Принято",
                    deficient: "Доработка",
                    ineffective: "Нет эффекта",
                    superseded: "Новые условия / назначение",
                  }[a.decision]
                : "Решение не внесено"}{" "}
              · {a.reason}
            </p>
          </div>
        ))}
      </details>
      <details>
        <summary>Ответственность, ожидания и сроки</summary>
        <p>
          До принятия назначения:{" "}
          {duration(hours(task.createdAt, task.acceptedAssignmentAt))}. До
          первого начала:{" "}
          {duration(hours(task.createdAt, task.attempts[0]?.startedAt))}.
        </p>
        {task.assignmentIntervals.map((x, i) => (
          <p key={`o-${i}`}>
            {person(state, x.value)} · {dateLabel(x.start, true)} —{" "}
            {x.end ? dateLabel(x.end, true) : "сейчас"} ·{" "}
            {duration(hours(x.start, x.end || now))}
          </p>
        ))}
        {task.waits.map((w) => (
          <p key={w.id}>
            {w.reason} · {duration(hours(w.start, w.end || now))} · контроль{" "}
            {dateLabel(w.reviewAt, true)}
          </p>
        ))}
        {task.deadlineChanges.map((x, i) => (
          <p key={`d-${i}`}>
            {dateLabel(x.old, true)} → {dateLabel(x.due, true)} · {x.reason}
          </p>
        ))}
        {task.transfers.map((t) => (
          <p key={t.id}>
            {person(state, t.fromId)} → {person(state, t.toId)} ·{" "}
            {t.decision === "accepted"
              ? "подтверждена"
              : t.decision === "forced"
                ? "решение руководителя"
                : t.decision === "rejected"
                  ? "отказ"
                  : "ожидает"}{" "}
            · {t.reason}
          </p>
        ))}
      </details>
      {!!task.notes?.length && (
        <details>
          <summary>Уточнения к заданию</summary>
          {task.notes.map((n, i) => (
            <p key={i}>
              <b>{person(state, n.actorId)}</b> · {dateLabel(n.at, true)}
              <br />
              {n.text}
              <br />
              <small>{n.reason}</small>
            </p>
          ))}
        </details>
      )}
    </>
  );
}
