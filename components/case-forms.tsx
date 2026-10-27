"use client";
import { useState } from "react";
import { Deviation, Investigation, severityLabels } from "../lib/domain/types";
import { inputISO, localInput, DAY, dateLabel } from "../lib/domain/time";
import { useApp } from "./context";
import { Field, Form, PeopleSelect, value } from "./forms";
import { canInvestigate, person } from "../lib/domain/permissions";
import { ObjectEditor } from "./object-editor";
export interface CaseFormProps {
  item: Deviation;
  onDone: () => void;
  onDirty: (dirty: boolean) => void;
}
export function AssessmentForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, now, run } = useApp();
  const [revision] = useState(state.revision);
  const a = item.assessmentDraft || item.assessments.at(-1);
  const [objects, setObjects] = useState(a?.objects || item.objects);
  const [mode, setMode] = useState("draft");
  if (user.role !== "quality")
    return (
      <>
        <p className="hint">Оценку оформляет уполномоченный качества.</p>
        {!item.assessments.length && <p>Подтверждённой оценки пока нет.</p>}
        {item.assessments.map((v, n) => (
          <details key={n} open={n === item.assessments.length - 1}>
            <summary>
              Оценка {n + 1} · {severityLabels[v.severity]}
            </summary>
            <p>{v.reason}</p>
            <dl className="metadata">
              <dt>Категория</dt>
              <dd>{v.category}</dd>
              <dt>Качество</dt>
              <dd>{v.impact || "Не указано"}</dd>
              <dt>Безопасность</dt>
              <dd>{v.safety || "Не указано"}</dd>
              <dt>Объём расследования</dt>
              <dd>{v.scope}</dd>
              <dt>Участники</dt>
              <dd>
                {v.participants.map((id) => person(state, id)).join(", ")}
              </dd>
              <dt>Руководитель</dt>
              <dd>{person(state, v.leadId)}</dd>
              <dt>Срок</dt>
              <dd>{dateLabel(v.due, true)}</dd>
              <dt>Подтверждено</dt>
              <dd>{dateLabel(v.confirmedAt, true)}</dd>
            </dl>
            <p>{v.revisionReason}</p>
          </details>
        ))}
      </>
    );
  return (
    <>
      <p className="hint">
        Черновик сохраняет ввод. Подтверждение оценки назначает расследование.
      </p>
      <Form
        label={mode === "draft" ? "Сохранить черновик" : "Подтвердить оценку"}
        onDirty={onDirty}
        submit={async (f) => {
          const assessment = {
            objects,
            severity: value(f, "severity"),
            reason: value(f, "reason"),
            category: value(f, "category"),
            impact: value(f, "impact"),
            safety: value(f, "safety"),
            scope: value(f, "scope"),
            participants: f.getAll("participants").map(String),
            leadId: value(f, "leadId"),
            due: inputISO(value(f, "due")),
            revisionReason: value(f, "revisionReason"),
          };
          await run(
            mode === "draft" ? "save_assessment" : "confirm_assessment",
            { assessment },
            item.id,
            undefined,
            revision,
          );
          onDone();
        }}
      >
        <div className="form-grid">
          <Field label="Критичность">
            <select name="severity" defaultValue={a?.severity || "medium"}>
              {Object.entries(severityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Категория">
            <select name="category" defaultValue={a?.category || "Процесс"}>
              {[
                "Процесс",
                "Сырьё",
                "Маркировка",
                "Документация",
                "Оборудование",
                "Другое",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Основание критичности" wide>
            <textarea name="reason" defaultValue={a?.reason} />
          </Field>
          <Field label="Влияние на качество">
            <textarea name="impact" defaultValue={a?.impact} />
          </Field>
          <Field label="Влияние на безопасность">
            <textarea name="safety" defaultValue={a?.safety} />
          </Field>
          <Field label="Объём расследования" wide>
            <textarea name="scope" defaultValue={a?.scope} />
          </Field>
          <Field label="Участники оценки">
            <PeopleSelect
              name="participants"
              multiple
              value={a?.participants || [user.id]}
            />
            <small>Для нескольких участников используйте Ctrl / Cmd.</small>
          </Field>
          <Field label="Руководитель расследования">
            <PeopleSelect
              name="leadId"
              manager
              value={a?.leadId || item.leadId}
            />
          </Field>
          <Field label="Срок дела">
            <input
              name="due"
              type="datetime-local"
              defaultValue={localInput(
                a?.due ||
                  item.due ||
                  new Date(Date.parse(now) + 14 * DAY).toISOString(),
              )}
            />
          </Field>
          <Field label="Основание пересмотра">
            <textarea name="revisionReason" defaultValue={a?.revisionReason} />
          </Field>
          <Field label="Действие" wide>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="draft">Сохранить черновик</option>
              <option value="confirm">
                Подтвердить и назначить расследование
              </option>
            </select>
          </Field>
        </div>
        <ObjectEditor
          objects={objects}
          setObjects={setObjects}
          onDirty={onDirty}
        />
      </Form>
      {item.assessments.length > 0 && (
        <details>
          <summary>Предыдущие оценки · {item.assessments.length}</summary>
          {item.assessments.map((v, i) => (
            <div className="history-item" key={i}>
              <b>
                {severityLabels[v.severity]} · {dateLabel(v.confirmedAt, true)}
              </b>
              <p>{v.reason}</p>
              <small>{v.revisionReason}</small>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
export function InvestigationForm({ item, onDone, onDirty }: CaseFormProps) {
  const { state, user, run } = useApp();
  const [revision] = useState(state.revision);
  const i = item.investigationDraft || item.investigations.at(-1);
  const [mode, setMode] = useState("draft");
  const [confirmed, setConfirmed] = useState(i?.confirmed ?? true);
  const [method, setMethod] = useState(i?.method || "Анализ фактов");
  const current = item.investigations.at(-1);
  return (
    <>
      {canInvestigate(user, item) ? (
        <Form
          label={
            mode === "draft"
              ? "Сохранить черновик"
              : "Представить вывод качеству"
          }
          onDirty={onDirty}
          submit={async (f) => {
            const investigation: Investigation = {
              facts: value(f, "facts"),
              chronology: value(f, "chronology"),
              participants: f.getAll("participants").map(String),
              hypotheses: value(f, "hypotheses"),
              evidence: value(f, "evidence"),
              method,
              why: [0, 1, 2, 3, 4].map((n) => value(f, `why-${n}`)),
              conclusion: value(f, "conclusion"),
              cause: value(f, "cause"),
              confirmed,
              uncertainty: value(f, "uncertainty"),
              revisionReason: value(f, "revisionReason"),
              revision: current?.revision || 0,
            };
            await run(
              mode === "draft" ? "save_investigation" : "submit_investigation",
              { investigation },
              item.id,
              undefined,
              revision,
            );
            onDone();
          }}
        >
          <div className="form-grid">
            <Field label="Собранные факты" wide>
              <textarea name="facts" defaultValue={i?.facts} rows={3} />
            </Field>
            <Field label="Хронология">
              <textarea name="chronology" defaultValue={i?.chronology} />
            </Field>
            <Field label="Участники">
              <PeopleSelect
                name="participants"
                multiple
                value={i?.participants || [item.leadId]}
              />
            </Field>
            <Field label="Проверенные гипотезы" wide>
              <textarea name="hypotheses" defaultValue={i?.hypotheses} />
            </Field>
            <Field label="Доказательства и ограничения" wide>
              <textarea name="evidence" defaultValue={i?.evidence} />
            </Field>
            <Field label="Метод анализа">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option>Анализ фактов</option>
                <option>5 почему</option>
                <option>Исикава</option>
                <option>Сопоставление данных</option>
              </select>
            </Field>
            <Field label="Результат поиска причины">
              <select
                value={confirmed ? "yes" : "no"}
                onChange={(e) => setConfirmed(e.target.value === "yes")}
              >
                <option value="yes">Причина подтверждена</option>
                <option value="no">Причина не подтверждена</option>
              </select>
            </Field>
            {method === "5 почему" &&
              [0, 1, 2, 3, 4].map((n) => (
                <Field key={n} label={`Почему ${n + 1}: вопрос и ответ`} wide>
                  <input name={`why-${n}`} defaultValue={i?.why[n]} />
                </Field>
              ))}
            <Field label="Итог расследования" wide>
              <textarea name="conclusion" defaultValue={i?.conclusion} />
            </Field>
            <Field label="Подтверждённая причина" wide>
              <textarea
                name="cause"
                defaultValue={i?.cause}
                placeholder={
                  confirmed ? "" : "Можно оставить пустым: причина не доказана"
                }
              />
            </Field>
            <Field label="Оставшаяся неопределённость" wide>
              <textarea name="uncertainty" defaultValue={i?.uncertainty} />
            </Field>
            <Field label="Основание нового вывода" wide>
              <textarea name="revisionReason" defaultValue="" />
            </Field>
            <Field label="Действие" wide>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="draft">Сохранить черновик</option>
                <option value="submit">Представить вывод качеству</option>
              </select>
            </Field>
          </div>
        </Form>
      ) : (
        <div className="read-section">
          <h3>
            {current ? "Представленный вывод" : "Вывод ещё не представлен"}
          </h3>
          {current && (
            <>
              <p>{current.conclusion}</p>
              <p>
                <b>
                  {current.confirmed
                    ? "Причина подтверждена"
                    : "Причина не подтверждена"}
                </b>
                <br />
                {current.cause || current.uncertainty}
              </p>
              <details>
                <summary>Материалы расследования</summary>
                <dl className="metadata">
                  <dt>Факты</dt>
                  <dd>{current.facts}</dd>
                  <dt>Гипотезы</dt>
                  <dd>{current.hypotheses}</dd>
                  <dt>Доказательства</dt>
                  <dd>{current.evidence}</dd>
                  <dt>Хронология</dt>
                  <dd>{current.chronology}</dd>
                  <dt>Метод</dt>
                  <dd>{current.method}</dd>
                </dl>
              </details>
            </>
          )}
        </div>
      )}
      {user.role === "quality" && current && !current.qualityDecision && (
        <Form
          label="Подтвердить рассмотрение вывода"
          onDirty={onDirty}
          submit={async (f) => {
            await run(
              "resolve_investigation",
              { reason: value(f, "reason") },
              item.id,
              undefined,
              revision,
            );
            onDone();
          }}
        >
          <Field label="Решение качества о дальнейших действиях *">
            <textarea name="reason" required />
          </Field>
        </Form>
      )}
      {item.investigations.length > 0 && (
        <details>
          <summary>Версии выводов · {item.investigations.length}</summary>
          {item.investigations.map((v) => (
            <div className="history-item" key={v.revision}>
              <b>
                Версия {v.revision} · {dateLabel(v.submittedAt, true)}
              </b>
              <p>{v.conclusion}</p>
              <small>
                {v.qualityDecision || "Ожидает рассмотрения качества"}
              </small>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
