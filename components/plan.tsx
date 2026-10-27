"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { CaseFormProps } from "./case-forms";
import { TaskSpec } from "../lib/domain/types";
import { toSpec } from "../lib/domain/case-commands";
import { canInvestigate, taskDone, person } from "../lib/domain/permissions";
import { uid } from "../lib/domain/helpers";
import { DAY, inputISO, localInput } from "../lib/domain/time";
import { useApp } from "./context";
import { Field, Form, value } from "./forms";
export function PlanForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, now, run } = useApp();
  const [revision] = useState(state.revision);
  const proposal = item.plans.find((p) => p.version > item.activePlanVersion);
  const [specs, setSpecs] = useState<TaskSpec[]>(
    structuredClone(
      proposal?.tasks ||
        item.tasks
          .filter((t) => ["action", "effectiveness"].includes(t.kind))
          .map(toSpec),
    ),
  );
  const [reason, setReason] = useState(proposal?.reason || "");
  const [technical, setTechnical] = useState(
    proposal?.technicalApproverId || "manager",
  );
  const canEdit =
    (canInvestigate(user, item) || user.role === "quality") &&
    proposal?.status !== "submitted";
  const update = (id: string, patch: Partial<TaskSpec>) => {
    setSpecs(specs.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    onDirty(true);
  };
  const add = (kind: "action" | "effectiveness") => {
    const id = uid();
    setSpecs([
      ...specs,
      {
        id,
        measureId: kind === "action" ? uid() : "",
        kind,
        title: "",
        outcome: "",
        ownerId: kind === "effectiveness" ? item.leadId : "employee",
        performerId: kind === "effectiveness" ? item.leadId : "employee",
        reviewerId: kind === "effectiveness" ? item.coordinatorId : "manager",
        due: new Date(
          Date.parse(now) + (kind === "effectiveness" ? 30 : 7) * DAY,
        ).toISOString(),
        criteria: "",
        requiredEvidence: "",
        required: true,
        dependencies: [],
        observationHours: kind === "effectiveness" ? 24 : 0,
        method: "",
      },
    ]);
    onDirty(true);
  };
  return (
    <>
      <div className="section-heading">
        <h3>
          План мер{" "}
          <span className="count">
            {item.activePlanVersion
              ? `v${item.activePlanVersion}`
              : "не утверждён"}
          </span>
        </h3>
      </div>
      {proposal?.status === "submitted" && (
        <div className="hint">
          Версия {proposal.version} на согласовании. До её утверждения действует
          версия {item.activePlanVersion || "—"}.
        </div>
      )}
      {canEdit ? (
        <Form
          label="Сохранить версию плана"
          onDirty={onDirty}
          submit={async () => {
            await run(
              "save_plan",
              { tasks: specs, reason, technicalApproverId: technical },
              item.id,
              undefined,
              revision,
            );
            onDone();
          }}
        >
          {specs.map((t, index) => {
            const live = item.tasks.find((x) => x.id === t.id);
            const frozen = live && taskDone(live);
            return (
              <details
                className="task-spec"
                key={t.id}
                open={!t.title || !live}
              >
                <summary>
                  {index + 1}.{" "}
                  {t.title ||
                    (t.kind === "effectiveness"
                      ? "Новая проверка эффективности"
                      : "Новое задание меры")}
                  {frozen && <small> · принято / отменено</small>}
                </summary>
                {frozen ? (
                  <p className="hint">
                    Результат сохранён. Для изменения создайте новую связанную
                    меру.
                  </p>
                ) : (
                  <>
                    <div className="form-grid">
                      <Field label="Конкретное действие *" wide>
                        <input
                          required
                          value={t.title}
                          onChange={(e) =>
                            update(t.id, { title: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Ожидаемый результат *" wide>
                        <textarea
                          required
                          value={t.outcome}
                          onChange={(e) =>
                            update(t.id, { outcome: e.target.value })
                          }
                        />
                      </Field>
                      {t.kind === "action" && (
                        <Field label="Мера">
                          <select
                            value={t.measureId}
                            onChange={(e) =>
                              update(t.id, { measureId: e.target.value })
                            }
                          >
                            {Array.from(
                              new Set(
                                specs
                                  .filter((x) => x.kind === "action")
                                  .map((x) => x.measureId),
                              ),
                            ).map((id, n) => (
                              <option key={id} value={id}>
                                Мера {n + 1}
                                {id === t.measureId ? " · текущая" : ""}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      {(["ownerId", "performerId", "reviewerId"] as const).map(
                        (key, n) => (
                          <Field
                            key={key}
                            label={
                              [
                                "Ответственный за результат",
                                "Исполнитель",
                                "Принимающий",
                              ][n]
                            }
                          >
                            <select
                              disabled={!!live && live.status !== "legacy"}
                              value={t[key]}
                              onChange={(e) =>
                                update(t.id, { [key]: e.target.value })
                              }
                            >
                              {state.people
                                .filter(
                                  (p) =>
                                    p.active &&
                                    p.role !== "admin" &&
                                    (key !== "reviewerId" ||
                                      ["quality", "manager"].includes(p.role)),
                                )
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                            </select>
                          </Field>
                        ),
                      )}
                      <Field label="Срок *">
                        <input
                          type="datetime-local"
                          required
                          disabled={!!live && live.status !== "legacy"}
                          value={localInput(t.due)}
                          onChange={(e) =>
                            update(t.id, { due: inputISO(e.target.value) })
                          }
                        />
                      </Field>
                      <Field label="Обязательность">
                        <select
                          value={t.required ? "yes" : "no"}
                          onChange={(e) =>
                            update(t.id, { required: e.target.value === "yes" })
                          }
                        >
                          <option value="yes">Обязательно для закрытия</option>
                          <option value="no">Необязательное</option>
                        </select>
                      </Field>
                      <Field label="Критерии приёмки *" wide>
                        <textarea
                          required
                          value={t.criteria}
                          onChange={(e) =>
                            update(t.id, { criteria: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Требуемые доказательства *" wide>
                        <textarea
                          required
                          value={t.requiredEvidence}
                          onChange={(e) =>
                            update(t.id, { requiredEvidence: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Зависит от заданий" wide>
                        <select
                          multiple
                          value={t.dependencies}
                          onChange={(e) =>
                            update(t.id, {
                              dependencies: Array.from(
                                e.target.selectedOptions,
                              ).map((x) => x.value),
                            })
                          }
                        >
                          {[
                            ...item.tasks.filter(
                              (x) => !specs.some((t) => t.id === x.id),
                            ),
                            ...specs,
                          ]
                            .filter((x) => x.id !== t.id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title || "Новое задание"}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {t.kind === "effectiveness" && (
                        <>
                          <Field label="Метод проверки *">
                            <input
                              required
                              value={t.method}
                              onChange={(e) =>
                                update(t.id, { method: e.target.value })
                              }
                            />
                          </Field>
                          <Field label="Наблюдение после приёмки, часов">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={t.observationHours}
                              onChange={(e) =>
                                update(t.id, {
                                  observationHours: Number(e.target.value),
                                })
                              }
                            />
                          </Field>
                          <Field label="Проверять не раньше">
                            <input
                              type="datetime-local"
                              value={localInput(t.notBefore)}
                              onChange={(e) =>
                                update(t.id, {
                                  notBefore: e.target.value
                                    ? inputISO(e.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                      <Field label="Связано с прежним заданием">
                        <select
                          value={t.relatedTaskId || ""}
                          onChange={(e) =>
                            update(t.id, {
                              relatedTaskId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Не связано</option>
                          {item.tasks
                            .filter((x) => x.id !== t.id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {live && (
                        <Field label="Основание отмены (если требуется)" wide>
                          <textarea
                            value={t.cancelReason || ""}
                            onChange={(e) =>
                              update(t.id, {
                                cancelReason: e.target.value || undefined,
                              })
                            }
                          />
                        </Field>
                      )}
                    </div>
                    {t.kind === "action" && (
                      <details>
                        <summary>Внешний подрядчик</summary>
                        <Field label="Подрядчик">
                          <select
                            value={t.contractor?.contractorId || ""}
                            onChange={(e) =>
                              update(t.id, {
                                contractor: e.target.value
                                  ? {
                                      contractorId: e.target.value,
                                      scope: t.outcome,
                                      zone: item.line,
                                      people: "",
                                      tools: "",
                                      requirements: ["Допуск к работе"],
                                      permits: [],
                                      events: [],
                                    }
                                  : undefined,
                              })
                            }
                          >
                            <option value="">Внутренняя работа</option>
                            {state.contractors
                              .filter((v) => v.active)
                              .map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        {t.contractor && (
                          <div className="form-grid">
                            {(
                              ["scope", "zone", "people", "tools"] as const
                            ).map((key, n) => (
                              <Field
                                key={key}
                                label={
                                  [
                                    "Объём работы",
                                    "Зона",
                                    "Специалисты подрядчика",
                                    "Инструменты",
                                  ][n]
                                }
                              >
                                <input
                                  value={t.contractor![key]}
                                  onChange={(e) =>
                                    update(t.id, {
                                      contractor: {
                                        ...t.contractor!,
                                        [key]: e.target.value,
                                      },
                                    })
                                  }
                                />
                              </Field>
                            ))}
                            <Field
                              label="Необходимые допуски, по одному на строку"
                              wide
                            >
                              <textarea
                                value={t.contractor.requirements.join("\n")}
                                onChange={(e) =>
                                  update(t.id, {
                                    contractor: {
                                      ...t.contractor!,
                                      requirements: e.target.value
                                        .split("\n")
                                        .filter(Boolean),
                                    },
                                  })
                                }
                              />
                            </Field>
                            <p className="hint wide">
                              Внутренний исполнитель вносит события и документы
                              подрядчика. Допуск оформляется для этой работы
                              после утверждения плана.
                            </p>
                          </div>
                        )}
                      </details>
                    )}
                    {!live && (
                      <button
                        type="button"
                        className="quiet danger"
                        onClick={() => {
                          setSpecs(specs.filter((x) => x.id !== t.id));
                          onDirty(true);
                        }}
                      >
                        <X size={15} /> Убрать из черновика
                      </button>
                    )}
                  </>
                )}
              </details>
            );
          })}
          <div className="button-row">
            <button type="button" onClick={() => add("action")}>
              <Plus size={16} /> Добавить меру / задание
            </button>
            <button type="button" onClick={() => add("effectiveness")}>
              <Plus size={16} /> Проверка эффективности
            </button>
          </div>
          <div className="form-grid">
            <Field label="Основание версии *" wide>
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <Field label="Профильный согласующий">
              <select
                value={technical}
                onChange={(e) => setTechnical(e.target.value)}
              >
                {state.people
                  .filter((p) => p.active && p.role === "manager")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </Form>
      ) : (
        <div className="compact-list">
          {(proposal?.tasks || specs).map((t) => (
            <div key={t.id}>
              <b>{t.title}</b>
              <small>
                {person(state, t.performerId)} · {t.criteria}
              </small>
            </div>
          ))}
        </div>
      )}
      {proposal &&
        ["draft", "returned"].includes(proposal.status) &&
        canEdit && (
          <Form
            label={`Отправить v${proposal.version} на согласование`}
            submit={async () => {
              await run(
                "submit_plan",
                { version: proposal.version },
                item.id,
                undefined,
                revision,
              );
              onDone();
            }}
          >
            <p className="hint">
              На согласование уйдёт сохранённая версия плана.
            </p>
          </Form>
        )}
      {proposal?.status === "submitted" &&
        (user.role === "quality" ||
          proposal.technicalApproverId === user.id) && (
          <Form
            label="Сохранить решение по версии"
            onDirty={onDirty}
            submit={async (f) => {
              await run(
                "review_plan",
                {
                  version: proposal.version,
                  decision: value(f, "decision"),
                  reason: value(f, "reason"),
                },
                item.id,
                undefined,
                revision,
              );
              onDone();
            }}
          >
            <Field label="Решение">
              <select name="decision">
                <option value="approved">Согласовать</option>
                <option value="returned">Вернуть на доработку</option>
              </select>
            </Field>
            <Field label="Основание *">
              <textarea name="reason" required />
            </Field>
          </Form>
        )}
      <details>
        <summary>История версий · {item.plans.length}</summary>
        {item.plans.map((p) => (
          <div className="history-item" key={p.version}>
            <b>
              v{p.version} ·{" "}
              {p.status === "approved"
                ? "Утверждён"
                : p.status === "submitted"
                  ? "На согласовании"
                  : p.status === "returned"
                    ? "Возвращён"
                    : "Черновик"}
            </b>
            <p>{p.reason}</p>
            {p.decisions.map((d, n) => (
              <p key={n}>
                {person(state, d.actorId)}:{" "}
                {d.decision === "approved" ? "согласовано" : "возвращено"} ·{" "}
                {d.reason}
              </p>
            ))}
          </div>
        ))}
      </details>
    </>
  );
}
