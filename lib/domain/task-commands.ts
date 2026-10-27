import {
  Command,
  Deviation,
  Person,
  Store,
  Task,
  TaskStatus,
  Transfer,
} from "./types";
import {
  activePerson,
  date,
  required,
  str,
  uid,
  readyProblems,
  notify,
  contractorProblems,
} from "./helpers";
import { isManager, isQuality, requireRule, taskDone } from "./permissions";
export function applyTaskCommand(
  s: Store,
  c: Deviation,
  t: Task,
  cmd: Command,
  actor: Person,
  now: string,
): string | undefined {
  const d = cmd.data || {};
  const reason = () => required(d.reason, "основание");
  const performer = () =>
    requireRule(
      actor.id === t.performerId,
      "Действие доступно назначенному исполнителю",
    );
  const owner = () =>
    requireRule(
      actor.id === t.ownerId || isManager(actor),
      "Действие доступно ответственному или руководителю",
    );
  const live = () =>
    requireRule(!taskDone(t), "Принятое или отменённое задание не изменяется");
  const eventTime = (lower?: string) => {
    const when = date(cmd.occurredAt || now, "фактическое событие");
    requireRule(
      when <= now && (!lower || when >= lower),
      "Время события не раньше предыдущего события и не в будущем",
    );
    return when;
  };
  const transfer = (tr: Transfer) => {
    const current = t.assignmentIntervals.at(-1);
    if (current && !current.end) current.end = now;
    const old = t.ownerId;
    t.ownerId = tr.toId;
    t.assignmentIntervals.push({ start: now, value: tr.toId });
    if (t.contractor && t.performerId === old) {
      requireRule(
        tr.toId !== t.reviewerId,
        "Сопровождающий не может принимать свою работу",
      );
      t.performerId = tr.toId;
    }
    tr.decidedAt = now;
  };
  switch (cmd.type) {
    case "accept_assignment":
      performer();
      requireRule(
        t.status === "assigned",
        "Назначение уже принято или недоступно",
      );
      t.status = "ready";
      t.acceptedAssignmentAt = now;
      return "Назначение принято";
    case "decline_assignment":
      performer();
      requireRule(
        t.status === "assigned",
        "Можно отказаться только от нового назначения",
      );
      reason();
      s.people
        .filter(isManager)
        .forEach((p) =>
          notify(
            s,
            `${uid()}:${p.id}`,
            p.id,
            `Требуется переназначение: ${t.title}`,
            now,
            c.id,
            t.id,
          ),
        );
      return "Отказ от назначения передан руководителю";
    case "start_task": {
      performer();
      requireRule(
        ["ready", "rework"].includes(t.status),
        "Сначала примите назначение",
      );
      const when = eventTime(
        t.attempts.at(-1)?.reviewedAt || t.acceptedAssignmentAt || t.createdAt,
      );
      const errors = readyProblems(c, t, when);
      if (t.contractor) errors.push(...contractorProblems(t.contractor, now));
      requireRule(!errors.length, errors.join("; "));
      t.status = "in_progress";
      t.attempts.push({ id: uid(), startedAt: when, documentIds: [] });
      return "Работа начата";
    }
    case "wait_task": {
      owner();
      requireRule(
        ["ready", "in_progress", "rework"].includes(t.status),
        "Ожидание недоступно в этом состоянии",
      );
      const reviewAt = date(d.reviewAt, "контроль ожидания");
      requireRule(reviewAt > now, "Контроль ожидания должен быть в будущем");
      const ownerId = required(d.ownerId, "владелец зависимости");
      activePerson(s, ownerId);
      t.waits.push({
        id: uid(),
        start: now,
        reason: reason(),
        dependency: required(d.dependency, "ожидаемый результат"),
        ownerId,
        reviewAt,
        resumeStatus: t.status,
      });
      t.status = "waiting";
      return "Зафиксировано ожидание";
    }
    case "resume_task":
      owner();
      requireRule(t.status === "waiting", "Нет активного ожидания");
      {
        const wait = t.waits.at(-1)!;
        wait.end = now;
        t.status = wait.resumeStatus;
      }
      return "Работа возобновлена";
    case "submit_task": {
      performer();
      requireRule(t.status === "in_progress", "Нет выполняемой работы");
      requireRule(
        !["assessment", "investigation"].includes(t.kind),
        "Завершите соответствующую форму дела",
      );
      const attempt = t.attempts.at(-1)!;
      const when = eventTime(attempt.startedAt);
      const documentIds = Array.isArray(d.documentIds)
        ? d.documentIds.map(String)
        : [];
      requireRule(
        documentIds.every((id) =>
          s.documents.some((x) => x.id === id && x.caseId === c.id),
        ),
        "Документ не принадлежит делу",
      );
      attempt.finishedAt = when;
      attempt.submittedAt = now;
      attempt.evidence = required(d.evidence, "подтверждение результата");
      attempt.source = required(d.source, "автор / источник");
      attempt.uploadedBy = actor.id;
      attempt.documentIds = documentIds;
      t.status = "submitted";
      notify(
        s,
        `${attempt.id}:review`,
        t.reviewerId,
        `Примите результат: ${t.title}`,
        now,
        c.id,
        t.id,
      );
      return "Результат передан на проверку";
    }
    case "review_task": {
      requireRule(
        t.status === "submitted" && actor.id === t.reviewerId,
        "Результат доступен назначенному принимающему",
      );
      requireRule(
        actor.id !== t.performerId,
        "Нельзя принять собственную работу",
      );
      const decision = str(d.decision);
      requireRule(
        ["accepted", "deficient", "ineffective"].includes(decision),
        "Выберите решение",
      );
      requireRule(
        decision !== "ineffective" || t.kind === "effectiveness",
        "Отсутствие эффекта относится к проверке эффективности",
      );
      if (t.kind === "effectiveness") {
        const errors = readyProblems(c, t, now);
        requireRule(!errors.length, errors.join("; "));
      }
      const attempt = t.attempts.at(-1)!;
      attempt.decision = decision as "accepted" | "deficient" | "ineffective";
      attempt.reason = reason();
      attempt.reviewedAt = now;
      attempt.reviewerId = actor.id;
      t.status =
        decision === "accepted"
          ? "accepted"
          : decision === "deficient"
            ? "rework"
            : "ineffective";
      if (decision === "accepted") {
        t.acceptedAt = now;
        const interval = t.assignmentIntervals.at(-1);
        if (interval && !interval.end) interval.end = now;
      }
      if (decision === "ineffective") {
        c.pendingReconsideration = true;
        c.failedInvestigationRevision = c.investigations.at(-1)?.revision || 0;
        c.noMeasures = undefined;
      }
      if (decision !== "accepted")
        notify(
          s,
          `${attempt.id}:return`,
          t.performerId,
          `${decision === "deficient" ? "Доработайте результат" : "Эффект не подтверждён"}: ${t.title}`,
          now,
          c.id,
          t.id,
        );
      return decision === "accepted"
        ? "Результат принят"
        : decision === "deficient"
          ? "Результат возвращён на доработку"
          : "Проверка не подтвердила эффект";
    }
    case "request_transfer":
    case "force_transfer": {
      live();
      owner();
      requireRule(
        !t.transfers.some((r) => !r.decision),
        "Уже есть незавершённая передача",
      );
      const toId = required(d.toId, "новый ответственный");
      requireRule(
        activePerson(s, toId).role !== "admin",
        "Администратор не назначается ответственным за производственную работу",
      );
      requireRule(toId !== t.ownerId, "Выберите другого ответственного");
      const tr: Transfer = {
        id: uid(),
        fromId: t.ownerId,
        toId,
        reason: reason(),
        requestedAt: now,
      };
      t.transfers.push(tr);
      if (cmd.type === "force_transfer") {
        requireRule(
          isManager(actor),
          "Принудительная передача доступна руководителю",
        );
        tr.decision = "forced";
        transfer(tr);
      }
      notify(
        s,
        tr.id,
        toId,
        `Передача ответственности: ${t.title}`,
        now,
        c.id,
        t.id,
      );
      return cmd.type === "force_transfer"
        ? "Ответственность передана руководителем"
        : "Запрошена передача ответственности";
    }
    case "decide_transfer": {
      const tr = t.transfers.find((r) => !r.decision);
      requireRule(tr && tr.toId === actor.id, "Нет входящей передачи");
      requireRule(
        ["accepted", "rejected"].includes(str(d.decision)),
        "Выберите решение",
      );
      tr.decision = d.decision as "accepted" | "rejected";
      tr.decisionReason = reason();
      tr.decidedAt = now;
      if (tr.decision === "accepted") transfer(tr);
      else
        s.people
          .filter(isManager)
          .forEach((p) =>
            notify(
              s,
              `${tr.id}:reject:${p.id}`,
              p.id,
              `Отклонена передача: ${t.title}`,
              now,
              c.id,
              t.id,
            ),
          );
      return tr.decision === "accepted"
        ? "Передача подтверждена"
        : "Передача отклонена";
    }
    case "replace_assignment": {
      live();
      requireRule(
        isManager(actor) || isQuality(actor),
        "Нет полномочий для переназначения",
      );
      reason();
      const role = str(d.function);
      requireRule(
        role === "performerId" || role === "reviewerId",
        "Выберите исполнителя или принимающего",
      );
      const toId = required(d.toId, "новый участник");
      const target = activePerson(s, toId);
      requireRule(
        target.role !== "admin",
        "Администратор не выполняет производственные задания",
      );
      if (role === "reviewerId")
        requireRule(
          ["quality", "manager"].includes(target.role),
          "Нужен профильный принимающий",
        );
      requireRule(
        toId !== (role === "reviewerId" ? t.performerId : t.reviewerId),
        "Нельзя назначить собственную приёмку",
      );
      if (
        t.status === "submitted" ||
        t.status === "in_progress" ||
        t.status === "waiting"
      ) {
        const a = t.attempts.at(-1);
        if (a && !a.reviewedAt) {
          a.decision = "superseded";
          a.reason = reason();
          a.reviewedAt = now;
          a.reviewerId = actor.id;
        }
        const w = t.waits.at(-1);
        if (w && !w.end) w.end = now;
        t.status = "rework";
      }
      t[role] = toId;
      if (role === "performerId") {
        t.status = "assigned";
        t.acceptedAssignmentAt = undefined;
      }
      notify(
        s,
        uid(),
        toId,
        `Изменено назначение: ${t.title}`,
        now,
        c.id,
        t.id,
      );
      return "Назначение изменено";
    }
    case "reschedule": {
      live();
      requireRule(
        t.kind === "effectiveness"
          ? isQuality(actor)
          : isManager(actor) || isQuality(actor),
        "Нет полномочий для переноса срока",
      );
      const due = date(d.due, "новый срок");
      requireRule(due > now, "Новый срок должен быть в будущем");
      t.deadlineChanges.push({
        old: t.due,
        due,
        reason: reason(),
        actorId: actor.id,
        at: now,
      });
      t.due = due;
      return "Срок задания перенесён";
    }
    case "contractor_permits": {
      live();
      owner();
      requireRule(t.contractor, "Задание не связано с подрядчиком");
      requireRule(Array.isArray(d.permits), "Укажите допуски");
      const permits = d.permits as typeof t.contractor.permits;
      permits.forEach((p) => {
        required(p.scope, "вид допуска");
        required(p.reference, "документ допуска");
        date(p.expiresAt, "окончание допуска");
      });
      t.contractor.permits = structuredClone(permits);
      t.contractor.approvedAt = undefined;
      t.contractor.approvedBy = undefined;
      return "Документы допуска сохранены";
    }
    case "approve_contractor": {
      live();
      requireRule(isQuality(actor), "Одобрение допуска доступно качеству");
      requireRule(t.contractor, "Подрядчик не назначен");
      const errors = contractorProblems(
        { ...t.contractor, approvedAt: now },
        now,
      );
      requireRule(!errors.length, errors.join("; "));
      t.contractor.approvedAt = now;
      t.contractor.approvedBy = actor.id;
      t.contractor.approvalReason = reason();
      return "Допуск подрядчика к работе одобрен";
    }
    case "contractor_event": {
      live();
      owner();
      requireRule(t.contractor, "Подрядчик не назначен");
      const kind = str(d.event);
      requireRule(
        ["called", "arrived", "no_show", "refused", "suspended"].includes(kind),
        "Неизвестное событие",
      );
      const when = eventTime(
        kind === "arrived" ? t.contractor.calledAt : t.createdAt,
      );
      if (kind === "arrived")
        requireRule(t.contractor.calledAt, "Сначала зафиксируйте вызов");
      reason();
      if (kind === "called") t.contractor.calledAt = when;
      if (kind === "arrived") t.contractor.arrivedAt = when;
      t.contractor.events.push({
        type: kind,
        at: when,
        recordedAt: now,
        reason: reason(),
        actorId: actor.id,
      });
      if (["no_show", "refused", "suspended"].includes(kind))
        notify(
          s,
          uid(),
          t.ownerId,
          `Требуется решение по подрядчику: ${t.title}`,
          now,
          c.id,
          t.id,
        );
      return "Событие подрядчика зарегистрировано";
    }
    case "replace_contractor": {
      live();
      requireRule(
        isManager(actor) || isQuality(actor),
        "Замена доступна руководителю или качеству",
      );
      requireRule(t.contractor, "Подрядчик не назначен");
      requireRule(
        t.status !== "submitted",
        "Сначала верните представленный результат",
      );
      const contractorId = required(d.contractorId, "подрядчик");
      requireRule(
        s.contractors.some((v) => v.id === contractorId && v.active),
        "Выберите действующего подрядчика",
      );
      reason();
      t.contractor.events.push({
        type: "replaced",
        at: now,
        recordedAt: now,
        reason: `${reason()} (${t.contractor.contractorId} → ${contractorId})`,
        actorId: actor.id,
      });
      t.contractor.contractorId = contractorId;
      t.contractor.permits = [];
      t.contractor.approvedAt = undefined;
      t.contractor.approvedBy = undefined;
      t.contractor.calledAt = undefined;
      t.contractor.arrivedAt = undefined;
      const w = t.waits.at(-1);
      if (w && !w.end) w.end = now;
      const attempt = t.attempts.at(-1);
      if (attempt && !attempt.reviewedAt) {
        attempt.decision = "superseded";
        attempt.reason = reason();
        attempt.reviewedAt = now;
      }
      t.status = "rework";
      return "Подрядчик заменён; допуски требуют проверки";
    }
    case "annotate_task":
      live();
      owner();
      required(d.note, "уточнение");
      reason();
      (t.notes ||= []).push({
        text: str(d.note),
        reason: reason(),
        actorId: actor.id,
        at: now,
      });
      return "Добавлено уточнение к заданию";
    case "cancel_task": {
      live();
      requireRule(
        isQuality(actor),
        "Отмену дополнительного задания подтверждает качество",
      );
      requireRule(
        ["immediate", "clarification"].includes(t.kind),
        "Плановую меру отменяют новой версией плана",
      );
      requireRule(
        !t.transfers.some((r) => !r.decision),
        "Сначала завершите передачу ответственности",
      );
      t.cancelReason = reason();
      t.status = "cancelled";
      t.cancelledAt = now;
      const interval = t.assignmentIntervals.at(-1);
      if (interval && !interval.end) interval.end = now;
      const wait = t.waits.at(-1);
      if (wait && !wait.end) wait.end = now;
      return "Дополнительное задание отменено по решению";
    }
    case "correct_time": {
      requireRule(isQuality(actor), "Время корректирует качество с основанием");
      reason();
      const attempt = t.attempts.find((a) => a.id === d.attemptId);
      requireRule(attempt, "Попытка не найдена");
      requireRule(
        d.field === "startedAt" || d.field === "finishedAt",
        "Можно исправить фактическое начало или окончание",
      );
      const when = date(d.value, "исправленное время");
      requireRule(when <= now, "Будущее событие запрещено");
      if (d.field === "startedAt") {
        requireRule(
          when >= (t.acceptedAssignmentAt || t.createdAt || when) &&
            (!attempt.finishedAt || when <= attempt.finishedAt),
          "Начало должно быть после назначения и до окончания",
        );
        const index = t.attempts.indexOf(attempt);
        const previous = t.attempts[index - 1];
        requireRule(
          !previous?.reviewedAt || when >= previous.reviewedAt,
          "Доработка не может начаться раньше предыдущей проверки",
        );
        const errors = readyProblems(c, t, when);
        requireRule(!errors.length, errors.join("; "));
        attempt.startedAt = when;
      } else {
        requireRule(
          attempt.finishedAt &&
            when >= attempt.startedAt &&
            (!attempt.submittedAt || when <= attempt.submittedAt),
          "Окончание должно быть между началом и сдачей",
        );
        attempt.finishedAt = when;
      }
      return "Фактическое время исправлено с основанием";
    }
    default:
      return undefined;
  }
}
