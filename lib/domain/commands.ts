import { ZodError } from "zod";
import {
  Command,
  CommandResult,
  Deviation,
  DocumentRecord,
  Store,
} from "./types";
import { registerSchema } from "./schemas";
import {
  activePerson,
  controlTask,
  date,
  logEvent,
  notify,
  required,
  str,
  syncStage,
  uid,
} from "./helpers";
import { isClosed, isQuality, requireRule, RuleError } from "./permissions";
import { applyTaskCommand } from "./task-commands";
import { applyCaseCommand } from "./case-commands";
import { alerts } from "./selectors";

export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const FILE_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "txt",
  "csv",
  "doc",
  "docx",
  "xls",
  "xlsx",
];
export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}) {
  requireRule(
    file.size > 0 && file.size <= MAX_FILE_SIZE,
    "Файл должен быть непустым и не больше 20 МБ",
  );
  requireRule(
    FILE_EXTENSIONS.includes(file.name.split(".").at(-1)?.toLowerCase() || ""),
    "Допустимы PDF, изображения, TXT, CSV, Word и Excel",
  );
  requireRule(
    ![
      "text/html",
      "image/svg+xml",
      "application/x-msdownload",
      "application/javascript",
    ].includes(file.type),
    "Недопустимый тип файла",
  );
}

function apply(s: Store, cmd: Command, now: string): CommandResult {
  const silent = ["read_notification", "refresh_alerts", "save_view"].includes(
    cmd.type,
  );
  requireRule(
    silent || cmd.expectedRevision === s.revision,
    "Данные изменились в другой вкладке. Обновите данные и повторно примените свой ввод",
  );
  date(now, "текущее время");
  if (cmd.occurredAt)
    requireRule(
      date(cmd.occurredAt, "время события") <= now,
      "Время события не может быть в будущем",
    );
  const actor = activePerson(s, cmd.actorId);
  const d = cmd.data || {};
  const c = cmd.caseId ? s.cases.find((c) => c.id === cmd.caseId) : undefined;
  if (cmd.caseId) requireRule(c, "Дело не найдено");
  if (c && !silent)
    requireRule(
      !isClosed(c),
      "Закрытая запись доступна только для чтения. Новый случай регистрируется отдельно",
    );
  const before = structuredClone(
    c
      ? { record: c, documents: s.documents.filter((d) => d.caseId === c.id) }
      : {
          settings: s.settings,
          people: s.people,
          areas: s.areas,
          objects: s.objects,
          contractors: s.contractors,
        },
  );
  let label: string | undefined;
  let resultId = c?.id;
  if (cmd.type === "register") {
    requireRule(
      actor.role !== "admin",
      "Администратор управляет справочниками; регистрацию выполняет производственный участник",
    );
    const value = registerSchema.parse(d);
    requireRule(
      date(value.detectedAt, "обнаружение") <= now,
      "Обнаружение не может быть в будущем",
    );
    const coordinator = activePerson(
      s,
      value.coordinatorId || s.settings.coordinatorId,
    );
    requireRule(isQuality(coordinator), "Назначьте координатора качества");
    activePerson(s, s.settings.investigatorId);
    if (value.relatedCaseId)
      requireRule(
        s.cases.some((x) => x.id === value.relatedCaseId),
        "Связанное дело не найдено",
      );
    const year = now.slice(0, 4);
    let number: string;
    do {
      s.counters[year] = (s.counters[year] || 0) + 1;
      number = `DEV-${year}-${String(s.counters[year]).padStart(4, "0")}`;
    } while (s.cases.some((x) => x.number === number));
    const created: Deviation = {
      ...value,
      id: uid(),
      number,
      revision: 1,
      registeredAt: now,
      enteredAt: now,
      authorId: actor.id,
      coordinatorId: coordinator.id,
      leadId: s.settings.investigatorId,
      stage: "assessment",
      deadlineChanges: [],
      assessments: [],
      investigations: [],
      pendingReconsideration: false,
      plans: [],
      activePlanVersion: 0,
      tasks: [],
      externalDecisions: [],
      stageIntervals: [{ value: "assessment", start: now }],
      ownerIntervals: [{ value: coordinator.id, start: now }],
      ownerTransfers: [],
      comments: [],
    };
    created.tasks.push(controlTask(created, "assessment", coordinator.id, now));
    s.cases.unshift(created);
    resultId = created.id;
    cmd = { ...cmd, caseId: created.id };
    label = "Отклонение зарегистрировано";
    notify(
      s,
      `${created.id}:assessment`,
      coordinator.id,
      `Оцените ${created.number}`,
      now,
      created.id,
      created.tasks[0].id,
    );
  } else if (cmd.type === "attach") {
    requireRule(c, "Выберите дело");
    requireRule(
      actor.role !== "admin",
      "Администратор не оформляет доказательства",
    );
    label = "Документы добавлены";
  } else if (cmd.type === "update_settings") {
    requireRule(actor.role === "admin", "Настройки изменяет администратор");
    const coordinator = activePerson(s, str(d.coordinatorId));
    requireRule(
      isQuality(coordinator),
      "Координатор должен иметь роль качества",
    );
    const lead = activePerson(s, str(d.investigatorId));
    requireRule(
      ["manager", "quality"].includes(lead.role),
      "Выберите руководителя расследования",
    );
    const alertHours = Number(d.alertHours),
      assignmentAlertHours = Number(d.assignmentAlertHours);
    requireRule(
      Number.isFinite(alertHours) &&
        alertHours >= 0 &&
        Number.isFinite(assignmentAlertHours) &&
        assignmentAlertHours > 0,
      "Некорректные сроки уведомлений",
    );
    s.settings = {
      coordinatorId: coordinator.id,
      investigatorId: lead.id,
      line: required(d.line, "линия"),
      alertHours,
      assignmentAlertHours,
    };
    label = "Настройки сохранены";
  } else if (cmd.type === "upsert_reference") {
    requireRule(actor.role === "admin", "Справочники изменяет администратор");
    const kind = str(d.kind);
    requireRule(
      ["people", "areas", "objects", "contractors"].includes(kind),
      "Неизвестный справочник",
    );
    const value = d.value as Record<string, unknown>;
    requireRule(value && typeof value === "object", "Нет записи справочника");
    const id = str(value.id) || uid();
    const name = required(value.name, "название");
    const active = value.active !== false;
    if (kind === "people") {
      const role = str(value.role);
      requireRule(
        ["employee", "quality", "manager", "admin"].includes(role),
        "Неизвестная роль",
      );
      const old = s.people.find((p) => p.id === id);
      requireRule(
        !old ||
          old.role === role ||
          !s.cases.some(
            (c) =>
              !isClosed(c) &&
              [
                c.coordinatorId,
                c.leadId,
                ...c.tasks.flatMap((t) => [
                  t.ownerId,
                  t.performerId,
                  t.reviewerId,
                ]),
              ].includes(id),
          ),
        "Нельзя изменить роль участника активных назначений",
      );
      requireRule(
        active ||
          ![
            s.settings.coordinatorId,
            s.settings.investigatorId,
            actor.id,
          ].includes(id),
        "Сначала измените настройки маршрутизации; собственную запись нельзя отключить",
      );
      const email = str(value.email);
      requireRule(
        !email ||
          !s.people.some(
            (p) =>
              p.id !== id && p.email?.toLowerCase() === email.toLowerCase(),
          ),
        "Email уже используется",
      );
      const person = {
        id,
        name,
        role: role as "employee" | "quality" | "manager" | "admin",
        email: email || undefined,
        active,
        department: str(value.department),
      };
      if (old) Object.assign(old, person);
      else s.people.push(person);
    } else if (kind === "contractors") {
      const old = s.contractors.find((v) => v.id === id);
      const value2 = {
        id,
        name,
        active,
        specialty: str(value.specialty),
        contact: str(value.contact),
      };
      if (old) Object.assign(old, value2);
      else s.contractors.push(value2);
    } else {
      const list = s[kind as "areas" | "objects"];
      const old = list.find((v) => v.id === id);
      if (old) Object.assign(old, { name, active });
      else list.push({ id, name, active });
    }
    label = "Справочник обновлён";
  } else if (cmd.type === "read_notification") {
    const item = s.notifications.find(
      (n) => n.id === d.id && n.userId === actor.id,
    );
    requireRule(item, "Уведомление не найдено");
    item.readAt = now;
  } else if (cmd.type === "refresh_alerts") {
    for (const a of alerts(s, now))
      notify(s, a.id, a.userId, a.title, now, a.caseId, a.taskId);
  } else if (cmd.type === "save_view") {
    s.views[actor.id] = structuredClone(d.view);
  } else {
    requireRule(c, "Выберите дело");
    const t = cmd.taskId ? c.tasks.find((t) => t.id === cmd.taskId) : undefined;
    if (cmd.taskId) requireRule(t, "Задание не найдено");
    if (t) label = applyTaskCommand(s, c, t, cmd, actor, now);
    if (!label && !t) label = applyCaseCommand(s, c, cmd, actor, now);
    requireRule(label, "Команда недоступна для выбранного объекта");
  }
  if (Array.isArray(d.documents) && d.documents.length) {
    requireRule(
      resultId && ["register", "attach"].includes(cmd.type),
      "Документы загружаются отдельной операцией",
    );
    for (const value of d.documents) {
      const file = value as DocumentRecord;
      validateFile(file);
      requireRule(
        file.id && !s.documents.some((x) => x.id === file.id),
        "Документ уже существует",
      );
      required(file.source, "автор документа");
      const target = s.cases.find((x) => x.id === resultId)!;
      if (file.taskId)
        requireRule(
          target.tasks.some((t) => t.id === file.taskId),
          "Задание документа не найдено",
        );
      if (file.decisionId)
        requireRule(
          target.externalDecisions.some((x) => x.id === file.decisionId),
          "Решение документа не найдено",
        );
      const previous = file.previousId
        ? s.documents.find(
            (x) => x.id === file.previousId && x.caseId === resultId,
          )
        : undefined;
      if (file.previousId)
        requireRule(previous, "Предыдущая версия не найдена");
      if (previous)
        requireRule(
          !s.documents.some((x) => x.previousId === previous.id),
          "Выберите последнюю версию документа",
        );
      const occurredAt = date(file.occurredAt || now, "дата документа");
      requireRule(occurredAt <= now, "Дата документа не может быть в будущем");
      s.documents.push({
        id: file.id,
        caseId: resultId,
        taskId: file.taskId || undefined,
        decisionId: file.decisionId || undefined,
        name: file.name,
        type: file.type,
        size: file.size,
        source: file.source,
        uploadedBy: actor.id,
        uploadedAt: now,
        occurredAt,
        previousId: previous?.id,
        version: previous ? previous.version + 1 : 1,
      });
    }
  }
  if (c && !silent) {
    if (cmd.type === "review_task" && c.pendingReconsideration) {
      const { setStage } = requireHelpers;
      setStage(c, "investigation", now);
    } else syncStage(c, now);
    c.revision++;
  }
  if (!silent) s.revision++;
  if (!silent)
    logEvent(
      s,
      cmd,
      actor,
      now,
      label!,
      before,
      structuredClone(
        resultId
          ? {
              record: s.cases.find((x) => x.id === resultId),
              documents: s.documents.filter((d) => d.caseId === resultId),
            }
          : {
              settings: s.settings,
              people: s.people,
              areas: s.areas,
              objects: s.objects,
              contractors: s.contractors,
            },
      ),
    );
  return { state: s, caseId: resultId };
}
import * as requireHelpers from "./helpers";
export function execute(
  state: Store,
  command: Command,
  now = new Date().toISOString(),
): CommandResult {
  try {
    return apply(structuredClone(state), structuredClone(command), now);
  } catch (e) {
    if (e instanceof ZodError)
      throw new RuleError(e.issues.map((x) => x.message).join("; "));
    throw e;
  }
}
