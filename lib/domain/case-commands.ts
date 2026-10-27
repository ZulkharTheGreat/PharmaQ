import { Command, Deviation, Person, Store, TaskSpec, Transfer } from "./types";
import { assessmentSchema, investigationSchema, taskSchema } from "./schemas";
import {
  activePerson,
  closureProblems,
  controlTask,
  date,
  finishControl,
  makeTask,
  notify,
  required,
  setStage,
  str,
  uid,
  validateAssessment,
  validateInvestigation,
  validateSpec,
} from "./helpers";
import {
  canInvestigate,
  isManager,
  isQuality,
  requireRule,
  taskDone,
} from "./permissions";

export function applyCaseCommand(
  s: Store,
  c: Deviation,
  cmd: Command,
  actor: Person,
  now: string,
): string | undefined {
  const d = cmd.data || {};
  const reason = () => required(d.reason, "основание");
  const quality = () =>
    requireRule(isQuality(actor), "Действие доступно уполномоченному качества");
  const investigator = () =>
    requireRule(
      canInvestigate(actor, c) || isQuality(actor),
      "Действие доступно руководителю расследования или качеству",
    );
  switch (cmd.type) {
    case "save_assessment":
    case "confirm_assessment": {
      quality();
      const a = assessmentSchema.parse(d.assessment);
      if (cmd.type === "save_assessment") {
        c.assessmentDraft = a;
        return "Черновик оценки сохранён";
      }
      validateAssessment(a, s, now);
      if (c.assessments.length)
        required(a.revisionReason, "основание пересмотра");
      a.participants.forEach((id) => activePerson(s, id));
      a.objects ||= structuredClone(c.objects);
      c.objects = structuredClone(a.objects);
      c.assessments.push({ ...a, authorId: actor.id, confirmedAt: now });
      c.assessmentDraft = undefined;
      c.leadId = a.leadId;
      if (c.due && c.due !== a.due)
        c.deadlineChanges.push({
          old: c.due,
          due: a.due,
          reason: a.revisionReason || a.reason,
          actorId: actor.id,
          at: now,
        });
      c.originalDue ||= a.due;
      c.due = a.due;
      finishControl(c, "assessment", now);
      if (!c.investigations.length) {
        setStage(c, "investigation", now);
        if (!c.tasks.some((t) => t.kind === "investigation" && !taskDone(t))) {
          const task = controlTask(c, "investigation", c.leadId, now);
          c.tasks.push(task);
          notify(
            s,
            `${task.id}:assignment`,
            c.leadId,
            `Оформите расследование: ${c.number}`,
            now,
            c.id,
            task.id,
          );
        }
      }
      return "Оценка подтверждена";
    }
    case "save_investigation":
    case "submit_investigation": {
      requireRule(
        canInvestigate(actor, c),
        "Расследование оформляет назначенный руководитель",
      );
      requireRule(c.assessments.length, "Сначала подтвердите оценку");
      const i = investigationSchema.parse(d.investigation);
      i.participants.forEach((id) => activePerson(s, id));
      if (cmd.type === "save_investigation") {
        c.investigationDraft = i;
        return "Черновик расследования сохранён";
      }
      validateInvestigation(i);
      if (c.investigations.length) {
        required(i.revisionReason, "основание нового вывода");
        requireRule(
          JSON.stringify([
            i.facts,
            i.hypotheses,
            i.evidence,
            i.conclusion,
            i.cause,
            i.uncertainty,
          ]) !==
            JSON.stringify([
              c.investigations.at(-1)!.facts,
              c.investigations.at(-1)!.hypotheses,
              c.investigations.at(-1)!.evidence,
              c.investigations.at(-1)!.conclusion,
              c.investigations.at(-1)!.cause,
              c.investigations.at(-1)!.uncertainty,
            ]),
          "Новый вывод должен учитывать новые данные",
        );
      }
      i.revision = (c.investigations.at(-1)?.revision || 0) + 1;
      c.investigations.push({ ...i, submittedAt: now, authorId: actor.id });
      c.investigationDraft = undefined;
      c.noMeasures = undefined;
      setStage(c, "investigation", now);
      notify(
        s,
        uid(),
        c.coordinatorId,
        "Рассмотрите вывод расследования",
        now,
        c.id,
      );
      return "Вывод расследования представлен";
    }
    case "resolve_investigation": {
      quality();
      const i = c.investigations.at(-1);
      requireRule(
        i && !i.qualityDecision,
        "Нет нового вывода для рассмотрения",
      );
      requireRule(
        c.failedInvestigationRevision === undefined ||
          i.revision > c.failedInvestigationRevision,
        "После неэффективности требуется новое расследование",
      );
      i.qualityDecision = reason();
      i.decidedAt = now;
      i.decidedBy = actor.id;
      c.pendingReconsideration = false;
      finishControl(c, "investigation", now);
      setStage(c, "plan", now);
      return "Вывод расследования рассмотрен качеством";
    }
    case "add_task": {
      investigator();
      const spec = taskSchema.parse(d.task);
      requireRule(
        ["immediate", "clarification"].includes(spec.kind),
        "Меры и эффективность добавляются в версию плана",
      );
      requireRule(
        !c.tasks.some((t) => t.id === spec.id),
        "Задание уже существует",
      );
      validateSpec(spec, s, c, now, [...c.tasks, spec]);
      if (spec.contractor) {
        spec.contractor.approvedAt = undefined;
        spec.contractor.approvedBy = undefined;
        spec.contractor.events = [];
      }
      c.tasks.push(makeTask(spec, now));
      notify(
        s,
        uid(),
        spec.performerId,
        `Новое задание: ${spec.title}`,
        now,
        c.id,
        spec.id,
      );
      return "Задание назначено";
    }
    case "save_plan": {
      investigator();
      requireRule(
        c.investigations.at(-1)?.qualityDecision,
        "Сначала рассмотрите вывод расследования",
      );
      requireRule(
        !c.pendingReconsideration,
        "Сначала завершите пересмотр расследования",
      );
      requireRule(Array.isArray(d.tasks), "Нет состава плана");
      const specs = d.tasks.map((x) => taskSchema.parse(x));
      requireRule(
        specs.length > 0,
        "Добавьте хотя бы одну меру или используйте маршрут без мер",
      );
      requireRule(
        new Set(specs.map((x) => x.id)).size === specs.length,
        "Повторяющиеся идентификаторы заданий",
      );
      const technical = activePerson(s, str(d.technicalApproverId));
      requireRule(isManager(technical), "Укажите профильного согласующего");
      for (const spec of specs) {
        requireRule(
          ["action", "effectiveness"].includes(spec.kind),
          "План содержит меры и проверки эффективности",
        );
        validateSpec(spec, s, c, now, [
          ...c.tasks.filter((t) => !specs.some((x) => x.id === t.id)),
          ...specs,
        ]);
        const existing = c.tasks.find((t) => t.id === spec.id);
        if (existing && taskDone(existing))
          requireRule(
            JSON.stringify(spec) === JSON.stringify(toSpec(existing)),
            "Принятый или отменённый результат нельзя переписать. Создайте связанную новую меру",
          );
        if (existing && existing.status !== "legacy") {
          requireRule(
            spec.ownerId === existing.ownerId &&
              spec.performerId === existing.performerId &&
              spec.reviewerId === existing.reviewerId,
            "Меняйте назначения отдельным действием",
          );
          requireRule(
            spec.due === existing.due,
            "Переносите срок отдельным действием",
          );
        }
        if (spec.contractor) {
          const old = existing?.contractor;
          const sameScope =
            old &&
            JSON.stringify([
              old.contractorId,
              old.scope,
              old.zone,
              old.people,
              old.tools,
              old.requirements,
            ]) ===
              JSON.stringify([
                spec.contractor.contractorId,
                spec.contractor.scope,
                spec.contractor.zone,
                spec.contractor.people,
                spec.contractor.tools,
                spec.contractor.requirements,
              ]);
          spec.contractor = {
            ...spec.contractor,
            permits: sameScope ? old.permits : [],
            approvedAt: sameScope ? old.approvedAt : undefined,
            approvedBy: sameScope ? old.approvedBy : undefined,
            approvalReason: sameScope ? old.approvalReason : undefined,
            events: old?.events || [],
            calledAt: old?.calledAt,
            arrivedAt: old?.arrivedAt,
          };
        }
      }
      const previous = c.plans.find((p) => p.version > c.activePlanVersion);
      requireRule(
        !previous || previous.status !== "submitted",
        "Сначала верните отправленную версию на доработку",
      );
      for (const existing of c.tasks.filter((t) =>
        ["action", "effectiveness"].includes(t.kind),
      ))
        requireRule(
          specs.some((t) => t.id === existing.id),
          "Нельзя удалить прежнюю меру; укажите обоснованную отмену",
        );
      const plan = {
        version: c.activePlanVersion + 1,
        baseVersion: c.activePlanVersion,
        status: "draft" as const,
        authorId: actor.id,
        createdAt: now,
        reason: reason(),
        tasks: specs,
        technicalApproverId: technical.id,
        decisions: [],
      };
      if (previous) c.plans[c.plans.indexOf(previous)] = plan;
      else c.plans.push(plan);
      c.noMeasures = undefined;
      return "Черновик плана сохранён";
    }
    case "submit_plan": {
      investigator();
      const plan = c.plans.find((p) => p.version === Number(d.version));
      requireRule(
        plan &&
          ["draft", "returned"].includes(plan.status) &&
          plan.baseVersion === c.activePlanVersion,
        "Нет актуального черновика плана",
      );
      plan.status = "submitted";
      plan.decisions = [];
      for (const id of [plan.technicalApproverId, c.coordinatorId])
        notify(
          s,
          `${uid()}:${id}`,
          id,
          `Согласуйте план v${plan.version}`,
          now,
          c.id,
        );
      return "План отправлен на согласование";
    }
    case "review_plan": {
      const plan = c.plans.find((p) => p.version === Number(d.version));
      requireRule(
        plan &&
          plan.status === "submitted" &&
          plan.baseVersion === c.activePlanVersion,
        "Устаревшая версия согласования",
      );
      const fn = isQuality(actor)
        ? "quality"
        : actor.id === plan.technicalApproverId && isManager(actor)
          ? "technical"
          : undefined;
      requireRule(fn, "Вы не назначены согласующим этой версии");
      const decision = str(d.decision);
      requireRule(
        ["approved", "returned"].includes(decision),
        "Выберите решение",
      );
      reason();
      if (decision === "returned") {
        plan.decisions.push({
          actorId: actor.id,
          function: fn,
          at: now,
          decision,
          reason: reason(),
        });
        plan.status = "returned";
        return "План возвращён на доработку";
      }
      requireRule(
        !plan.decisions.some(
          (x) => x.function === fn && x.decision === "approved",
        ),
        "Эта функция уже согласовала версию",
      );
      // Revalidate against live tasks: work may have been accepted since the proposal.
      for (const spec of plan.tasks) {
        const old = c.tasks.find((t) => t.id === spec.id);
        if (old && taskDone(old))
          requireRule(
            JSON.stringify(spec) === JSON.stringify(toSpec(old)),
            "Результат уже принят; требуется новая связанная мера",
          );
        if (old && old.status !== "legacy")
          requireRule(
            spec.due === old.due &&
              spec.ownerId === old.ownerId &&
              spec.performerId === old.performerId &&
              spec.reviewerId === old.reviewerId,
            "Назначение или срок изменились. Верните план и обновите версию",
          );
      }
      plan.decisions.push({
        actorId: actor.id,
        function: fn,
        at: now,
        decision: "approved",
        reason: reason(),
      });
      if (
        ["quality", "technical"].every((f) =>
          plan.decisions.some(
            (x) => x.function === f && x.decision === "approved",
          ),
        )
      ) {
        requireRule(
          !c.pendingReconsideration,
          "Сначала завершите пересмотр расследования",
        );
        for (const spec of plan.tasks) {
          let old = c.tasks.find((t) => t.id === spec.id);
          if (!old) {
            old = makeTask(spec, now, plan.version);
            c.tasks.push(old);
            notify(
              s,
              uid(),
              old.performerId,
              `Назначено: ${old.title}`,
              now,
              c.id,
              old.id,
            );
          } else if (!taskDone(old)) {
            const changed =
              JSON.stringify(toSpec(old)) !== JSON.stringify(spec);
            if (
              changed &&
              ["submitted", "in_progress", "ineffective", "waiting"].includes(
                old.status,
              )
            ) {
              const a = old.attempts.at(-1);
              if (a && !a.reviewedAt) {
                a.decision = "superseded";
                a.reason = plan.reason;
                a.reviewedAt = now;
                a.reviewerId = actor.id;
              }
              const w = old.waits.at(-1);
              if (w && !w.end) w.end = now;
              old.status = "rework";
            }
            if (old.status === "legacy") {
              old.status = "assigned";
              old.createdAt = now;
              old.originalDue ||= spec.due;
              old.assignmentIntervals.push({ start: now, value: spec.ownerId });
            }
            Object.assign(old, structuredClone(spec), {
              planVersion: plan.version,
            });
          }
          if (spec.cancelReason && !taskDone(old)) {
            required(spec.cancelReason, "основание отмены");
            requireRule(
              !old.transfers.some((r) => !r.decision),
              "Сначала завершите передачу отменяемого задания",
            );
            const w = old.waits.at(-1);
            if (w && !w.end) w.end = now;
            old.status = "cancelled";
            old.cancelledAt = now;
            const interval = old.assignmentIntervals.at(-1);
            if (interval && !interval.end) interval.end = now;
          }
        }
        plan.status = "approved";
        plan.approvedAt = now;
        c.activePlanVersion = plan.version;
        setStage(c, "execution", now);
      }
      return plan.status === "approved"
        ? `План v${plan.version} утверждён`
        : "Согласование версии сохранено";
    }
    case "no_measures":
      quality();
      requireRule(
        c.investigations.at(-1)?.qualityDecision && !c.pendingReconsideration,
        "Нужно рассмотренное расследование",
      );
      requireRule(
        !c.tasks.some(
          (t) => ["action", "effectiveness"].includes(t.kind) && !taskDone(t),
        ),
        "Открытые меры и проверки требуют отдельных решений",
      );
      requireRule(
        !c.plans.some((p) => p.version > c.activePlanVersion),
        "Есть новая версия плана",
      );
      c.noMeasures = {
        reason: reason(),
        actorId: actor.id,
        at: now,
        investigationRevision: c.investigations.at(-1)!.revision,
      };
      setStage(c, "closure", now);
      return "Принято решение о маршруте без мер";
    case "require_decision":
      quality();
      c.externalDecisions.push({
        id: uid(),
        subject: required(d.subject, "объект решения"),
        type: required(d.decisionType, "тип решения"),
        responsible: required(d.responsible, "внешний ответственный"),
        required: d.required !== false,
        state: "pending",
        documentIds: [],
      });
      return "Запрошено внешнее решение";
    case "record_decision": {
      quality();
      const external = c.externalDecisions.find((x) => x.id === d.decisionId);
      requireRule(
        external && external.state === "pending",
        "Нет ожидающего внешнего решения",
      );
      const decidedAt = date(d.decidedAt, "дата решения");
      requireRule(decidedAt <= now, "Дата решения не может быть в будущем");
      external.reference = required(d.reference, "документ / ссылка");
      external.author = required(d.author, "автор решения");
      external.result = required(d.result, "содержание внешнего решения");
      external.decidedAt = decidedAt;
      external.recordedAt = now;
      external.recordedBy = actor.id;
      external.state = "recorded";
      return "Внешнее решение зарегистрировано";
    }
    case "close":
      quality();
      {
        const errors = closureProblems(c);
        requireRule(!errors.length, errors.map((x) => x.label).join("; "));
        c.closureReason = reason();
        c.closedAt = now;
        setStage(c, "closed", now);
        const interval = c.stageIntervals.at(-1);
        if (interval) interval.end = now;
        const ownerInterval = c.ownerIntervals.at(-1);
        if (ownerInterval) ownerInterval.end = now;
      }
      return "Отклонение закрыто";
    case "dispose": {
      quality();
      const route = str(d.route);
      requireRule(
        ["duplicate", "out_of_scope"].includes(route),
        "Выберите специальный маршрут",
      );
      reason();
      requireRule(
        !c.tasks.some(
          (t) =>
            !["assessment", "investigation"].includes(t.kind) && !taskDone(t),
        ),
        "Сначала завершите или обоснованно отмените обязательства",
      );
      requireRule(
        !c.ownerTransfers.some((t) => !t.decision) &&
          !c.tasks.some((t) => t.transfers.some((r) => !r.decision)),
        "Не завершена передача",
      );
      requireRule(
        !c.externalDecisions.some((x) => x.required && x.state !== "recorded"),
        "Нет обязательного внешнего решения",
      );
      requireRule(
        !c.plans.some((p) => p.version > c.activePlanVersion) &&
          !c.pendingReconsideration,
        "Есть незавершённый пересмотр",
      );
      if (route === "duplicate") {
        const target = s.cases.find((x) => x.id === d.relatedCaseId);
        requireRule(
          target && target.id !== c.id && target.stage !== "duplicate",
          "Выберите основное дело",
        );
        c.duplicateOf = target.id;
      }
      finishControl(c, "assessment", now);
      finishControl(c, "investigation", now);
      c.closureReason = reason();
      c.closedAt = now;
      setStage(c, route as "duplicate" | "out_of_scope", now);
      c.stageIntervals.at(-1)!.end = now;
      const ownerInterval = c.ownerIntervals.at(-1);
      if (ownerInterval && !ownerInterval.end) ownerInterval.end = now;
      return route === "duplicate"
        ? "Зафиксирован дубль"
        : "Сообщение завершено вне области отклонений";
    }
    case "comment":
      required(d.text, "комментарий");
      c.comments.push({
        id: uid(),
        authorId: actor.id,
        text: str(d.text),
        at: now,
      });
      return "Комментарий добавлен";
    case "reschedule":
      quality();
      {
        const due = date(d.due, "срок дела");
        requireRule(due > now, "Срок должен быть в будущем");
        c.deadlineChanges.push({
          old: c.due,
          due,
          actorId: actor.id,
          at: now,
          reason: reason(),
        });
        c.originalDue ||= due;
        c.due = due;
      }
      return "Срок дела перенесён";
    case "request_transfer":
    case "force_transfer": {
      requireRule(
        actor.id === c.coordinatorId || isManager(actor),
        "Передаёт координатор или руководитель",
      );
      requireRule(
        !c.ownerTransfers.some((t) => !t.decision),
        "Уже есть ожидающая передача",
      );
      const target = activePerson(s, str(d.toId));
      requireRule(
        isQuality(target),
        "Координатор дела должен иметь роль качества",
      );
      requireRule(
        target.id !== c.coordinatorId,
        "Выберите другого координатора",
      );
      const tr: Transfer = {
        id: uid(),
        fromId: c.coordinatorId,
        toId: target.id,
        reason: reason(),
        requestedAt: now,
      };
      if (cmd.type === "force_transfer") {
        requireRule(isManager(actor), "Требуются полномочия руководителя");
        tr.decision = "forced";
        tr.decidedAt = now;
        const oldInterval = c.ownerIntervals.at(-1);
        if (oldInterval && !oldInterval.end) oldInterval.end = now;
        c.coordinatorId = target.id;
        c.ownerIntervals.push({ start: now, value: target.id });
      }
      c.ownerTransfers.push(tr);
      notify(s, tr.id, target.id, `Передача дела ${c.number}`, now, c.id);
      return "Записана передача дела";
    }
    case "decide_transfer": {
      const tr = c.ownerTransfers.find((t) => !t.decision);
      requireRule(tr && tr.toId === actor.id, "Нет входящей передачи дела");
      requireRule(
        ["accepted", "rejected"].includes(str(d.decision)),
        "Выберите решение",
      );
      tr.decision = d.decision as "accepted" | "rejected";
      tr.decisionReason = reason();
      tr.decidedAt = now;
      if (tr.decision === "accepted") {
        const old = c.ownerIntervals.at(-1);
        if (old) old.end = now;
        c.coordinatorId = actor.id;
        c.ownerIntervals.push({ value: actor.id, start: now });
      } else
        s.people
          .filter(isManager)
          .forEach((p) =>
            notify(
              s,
              `${tr.id}:${p.id}`,
              p.id,
              "Передача дела отклонена",
              now,
              c.id,
            ),
          );
      return "Решение по передаче сохранено";
    }
    case "clarify_legacy": {
      quality();
      requireRule(c.legacy, "Не является прежней записью");
      reason();
      const coordinator = activePerson(s, str(d.coordinatorId));
      requireRule(isQuality(coordinator), "Назначьте координатора качества");
      c.coordinatorId = coordinator.id;
      const oldInterval = c.ownerIntervals.at(-1);
      if (oldInterval && !oldInterval.end) oldInterval.end = now;
      c.ownerIntervals.push({ start: now, value: coordinator.id });
      c.leadId = s.settings.investigatorId;
      c.legacy.needsClarification = false;
      setStage(c, "assessment", now);
      if (!c.tasks.some((t) => t.kind === "assessment" && !taskDone(t)))
        c.tasks.push(controlTask(c, "assessment", c.coordinatorId, now));
      return "Прежняя запись направлена на уточнённую оценку";
    }
    case "correct_time": {
      quality();
      reason();
      const field = str(d.field);
      requireRule(
        field === "detectedAt",
        "Исправляется время обнаружения; события исполнения сохраняются как внесены",
      );
      const value = date(d.value, "время обнаружения");
      requireRule(
        value <= (c.registeredAt || now),
        "Обнаружение не позже регистрации",
      );
      c.detectedAt = value;
      return "Время обнаружения исправлено с основанием";
    }
    default:
      return undefined;
  }
}
export function toSpec(t: TaskSpec): TaskSpec {
  const {
    id,
    measureId,
    kind,
    title,
    outcome,
    ownerId,
    performerId,
    reviewerId,
    due,
    criteria,
    requiredEvidence,
    required,
    dependencies,
    observationHours,
    notBefore,
    method,
    contractor,
    cancelReason,
    relatedTaskId,
  } = t;
  return {
    id,
    measureId,
    kind,
    title,
    outcome,
    ownerId,
    performerId,
    reviewerId,
    due,
    criteria,
    requiredEvidence,
    required,
    dependencies,
    observationHours,
    ...(notBefore ? { notBefore } : {}),
    method,
    ...(contractor ? { contractor: structuredClone(contractor) } : {}),
    ...(cancelReason ? { cancelReason } : {}),
    ...(relatedTaskId ? { relatedTaskId } : {}),
  };
}
