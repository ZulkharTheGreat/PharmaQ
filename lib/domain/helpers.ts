import {
  Assessment,
  Command,
  Deviation,
  HistoryEvent,
  Investigation,
  Person,
  Store,
  Task,
  TaskSpec,
  Stage,
  ContractorWork,
} from "./types";
import { requireRule, taskDone } from "./permissions";
import { validDate, HOUR } from "./time";
export const uid = () => crypto.randomUUID();
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const required = (v: unknown, label: string) => {
  const s = str(v);
  requireRule(s, `Заполните: ${label}`);
  return s;
};
export const date = (v: unknown, label: string) => {
  requireRule(validDate(v), `Некорректная дата: ${label}`);
  return v;
};
export function activePerson(s: Store, id: string) {
  const p = s.people.find((p) => p.id === id && p.active);
  requireRule(p, "Выберите действующего участника");
  return p;
}
export function setStage(c: Deviation, stage: Stage, now: string) {
  if (c.stage === stage) return;
  const previous = c.stageIntervals.at(-1);
  if (previous && !previous.end) previous.end = now;
  c.stage = stage;
  c.stageIntervals.push({ value: stage, start: now });
}
export function makeTask(spec: TaskSpec, now: string, version?: number): Task {
  return {
    ...structuredClone(spec),
    status: "assigned",
    createdAt: now,
    originalDue: spec.due,
    assignmentIntervals: [{ start: now, value: spec.ownerId }],
    attempts: [],
    waits: [],
    transfers: [],
    deadlineChanges: [],
    planVersion: version,
  };
}
export function controlTask(
  c: Deviation,
  kind: "assessment" | "investigation",
  performerId: string,
  now: string,
): Task {
  return makeTask(
    {
      id: uid(),
      measureId: "",
      kind,
      title:
        kind === "assessment" ? "Оценить отклонение" : "Оформить расследование",
      outcome: "",
      ownerId: performerId,
      performerId,
      reviewerId: kind === "assessment" ? c.leadId : c.coordinatorId,
      due: c.due || "",
      criteria: "Полнота и обоснованность материалов",
      requiredEvidence: "",
      required: true,
      dependencies: [],
      observationHours: 0,
      method: "",
    },
    now,
  );
}
export function finishControl(c: Deviation, kind: string, now: string) {
  c.tasks
    .filter((t) => t.kind === kind && !taskDone(t))
    .forEach((t) => {
      t.status = "accepted";
      t.acceptedAt = now;
      const interval = t.assignmentIntervals.at(-1);
      if (interval && !interval.end) interval.end = now;
    });
}
export function validateAssessment(a: Assessment, s: Store, now: string) {
  requireRule(
    ["low", "medium", "high", "critical"].includes(a.severity),
    "Выберите критичность",
  );
  required(a.reason, "основание оценки");
  required(a.scope, "объём расследования");
  requireRule(
    a.participants.length > 0 &&
      a.participants.some((id) => activePerson(s, id).role === "quality"),
    "В оценке должен участвовать сотрудник качества",
  );
  const lead = activePerson(s, a.leadId);
  requireRule(
    ["manager", "quality"].includes(lead.role),
    "Руководитель расследования должен иметь профильные полномочия",
  );
  requireRule(date(a.due, "срок дела") > now, "Укажите будущий срок дела");
}
export function validateInvestigation(i: Investigation) {
  required(i.facts, "факты");
  required(i.hypotheses, "проверенные гипотезы");
  required(i.evidence, "доказательства");
  required(i.conclusion, "итог расследования");
  requireRule(i.participants.length > 0, "Укажите участников расследования");
  if (i.confirmed) required(i.cause, "подтверждённая причина");
  else required(i.uncertainty, "оставшаяся неопределённость");
}
export function validateSpec(
  spec: TaskSpec,
  s: Store,
  c: Deviation,
  now: string,
  all: TaskSpec[],
) {
  required(spec.title, "действие");
  required(spec.outcome, "ожидаемый результат");
  required(spec.criteria, "критерии приёмки");
  required(spec.requiredEvidence, "требуемые доказательства");
  requireRule(
    activePerson(s, spec.ownerId).role !== "admin",
    "Администратор не назначается ответственным за производственную работу",
  );
  requireRule(
    activePerson(s, spec.performerId).role !== "admin",
    "Администратор не назначается исполнителем производственной работы",
  );
  const reviewer = activePerson(s, spec.reviewerId);
  requireRule(
    ["quality", "manager"].includes(reviewer.role),
    "Принимающий — качество или профильный специалист",
  );
  requireRule(
    spec.performerId !== spec.reviewerId,
    "Исполнитель не может принимать собственную работу",
  );
  const old = c.tasks.find((t) => t.id === spec.id);
  requireRule(
    date(spec.due, "срок задания") > now || !!old,
    "Укажите будущий срок задания",
  );
  requireRule(
    Number.isFinite(spec.observationHours) && spec.observationHours >= 0,
    "Период наблюдения не может быть отрицательным",
  );
  if (spec.notBefore) date(spec.notBefore, "не раньше");
  if (spec.kind === "effectiveness") {
    required(spec.method, "метод проверки");
    requireRule(spec.dependencies.length > 0, "Свяжите проверку с мерами");
  }
  requireRule(
    spec.dependencies.every(
      (id) => id !== spec.id && all.some((t) => t.id === id),
    ),
    "Неизвестная зависимость или ссылка на себя",
  );
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string) => {
    requireRule(!visiting.has(id), "Циклические зависимости запрещены");
    if (done.has(id)) return;
    visiting.add(id);
    all.find((t) => t.id === id)?.dependencies.forEach(visit);
    visiting.delete(id);
    done.add(id);
  };
  all.forEach((t) => visit(t.id));
  if (spec.contractor) {
    requireRule(
      s.contractors.some(
        (v) => v.id === spec.contractor?.contractorId && v.active,
      ),
      "Подрядчик не найден или неактивен",
    );
    required(spec.contractor.scope, "объём внешней работы");
    requireRule(
      spec.contractor.requirements.length > 0,
      "Укажите необходимые допуски",
    );
  }
}
export function contractorProblems(
  work: ContractorWork,
  now: string,
): string[] {
  const errors: string[] = [];
  if (!work.approvedAt) errors.push("Нет одобрения допуска для этой работы");
  for (const scope of work.requirements) {
    if (
      !work.permits.some(
        (p) =>
          p.scope === scope &&
          p.zone === work.zone &&
          p.people === work.people &&
          p.tools === work.tools &&
          p.expiresAt > now &&
          p.reference,
      )
    )
      errors.push(`Нет действующего допуска: ${scope}`);
  }
  return errors;
}
export function readyProblems(c: Deviation, t: Task, now: string) {
  const errors: string[] = [];
  for (const id of t.dependencies) {
    const parent = c.tasks.find((t) => t.id === id);
    if (!parent || parent.status !== "accepted" || !parent.acceptedAt)
      errors.push(`Сначала примите связанную меру: ${parent?.title || id}`);
    else if (
      t.kind === "effectiveness" &&
      Date.parse(now) <
        Date.parse(parent.acceptedAt) + t.observationHours * HOUR
    )
      errors.push("Не завершён период наблюдения");
  }
  if (t.notBefore && now < t.notBefore)
    errors.push("Дата «не раньше» ещё не наступила");
  if (t.contractor) errors.push(...contractorProblems(t.contractor, now));
  return errors;
}
export function syncStage(c: Deviation, now: string) {
  if (
    ["closed", "duplicate", "out_of_scope"].includes(c.stage) ||
    !c.activePlanVersion ||
    c.pendingReconsideration ||
    !c.investigations.at(-1)?.qualityDecision
  )
    return;
  const active = c.tasks.filter(
    (t) =>
      ["action", "effectiveness"].includes(t.kind) &&
      t.required &&
      !taskDone(t),
  );
  if (!active.length) setStage(c, "closure", now);
  else if (active.every((t) => t.kind === "effectiveness"))
    setStage(c, "effectiveness", now);
  else if (active.some((t) => t.status === "submitted"))
    setStage(c, "acceptance", now);
  else setStage(c, "execution", now);
}
export function closureProblems(c: Deviation) {
  const errors: { label: string; section: string }[] = [];
  const add = (label: string, section: string) =>
    errors.push({ label, section });
  if (!c.assessments.length) add("Не подтверждена оценка", "assessment");
  if (c.assessmentDraft)
    add("Есть незавершённый черновик оценки", "assessment");
  if (c.investigationDraft)
    add("Есть незавершённый черновик расследования", "investigation");
  const i = c.investigations.at(-1);
  if (!i?.qualityDecision)
    add("Нет рассмотренного итога расследования", "investigation");
  if (!c.activePlanVersion && !c.noMeasures)
    add("Нет согласованного плана или решения без мер", "plan");
  if (c.pendingReconsideration)
    add(
      "Требуется новое расследование после отрицательного результата",
      "investigation",
    );
  if (
    c.plans.some(
      (p) =>
        ["draft", "submitted", "returned"].includes(p.status) &&
        p.version > c.activePlanVersion,
    )
  )
    add("Не завершено согласование новой версии плана", "plan");
  for (const t of c.tasks) {
    if (t.required && !taskDone(t))
      add(`Не завершено: ${t.title}`, `task:${t.id}`);
    if (t.transfers.some((r) => !r.decision))
      add(`Ожидает передачи: ${t.title}`, `task:${t.id}`);
  }
  if (c.ownerTransfers.some((r) => !r.decision))
    add("Не завершена передача дела", "details");
  c.externalDecisions
    .filter((d) => d.required && d.state !== "recorded")
    .forEach((d) => add(`Нет внешнего решения: ${d.subject}`, "external"));
  if (c.legacy?.needsClarification)
    add("Уточните данные прежней записи", "legacy");
  return errors;
}
// This checksum detects accidental edits only; local storage is not a protected audit system.
export function checksum(value: unknown) {
  let n = 2166136261;
  const text = JSON.stringify(value);
  for (let i = 0; i < text.length; i++)
    n = Math.imul(n ^ text.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16);
}
export function auditValid(events: HistoryEvent[]) {
  let previous = "0";
  for (const e of events) {
    const { checksum: stored, ...body } = e;
    if (body.previous !== previous || checksum(body) !== stored) return false;
    previous = stored;
  }
  return true;
}
export function logEvent(
  s: Store,
  cmd: Command,
  actor: Person,
  now: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  const body: Omit<HistoryEvent, "checksum"> = {
    id: uid(),
    seq: s.events.length + 1,
    caseId: cmd.caseId,
    taskId: cmd.taskId,
    actorId: actor.id,
    actorRole: actor.role,
    action: cmd.type,
    label,
    reason: str(cmd.data?.reason),
    occurredAt: cmd.occurredAt || now,
    recordedAt: now,
    revision: s.revision,
    before,
    after,
    previous: s.events.at(-1)?.checksum || "0",
  };
  s.events.push({ ...body, checksum: checksum(body) });
}
export function notify(
  s: Store,
  id: string,
  userId: string,
  title: string,
  now: string,
  caseId?: string,
  taskId?: string,
) {
  if (!s.notifications.some((n) => n.id === id))
    s.notifications.push({ id, userId, title, at: now, caseId, taskId });
}
