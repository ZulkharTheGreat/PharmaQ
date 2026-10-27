import test from "node:test";
import assert from "node:assert/strict";
import { Harness } from "./harness";
import { execute, validateFile } from "../lib/domain/commands";
import { auditValid, closureProblems } from "../lib/domain/helpers";
import {
  alerts,
  caseAge,
  csv,
  filterCases,
  overdue,
  report,
  workQueue,
} from "../lib/domain/selectors";
import { hours, validDate } from "../lib/domain/time";
import { toSpec } from "../lib/domain/case-commands";
import { makeDemo } from "../lib/demo/seed";
import { emptyStore } from "../lib/demo/people";

test("T01: штатный путь, приёмка, эффективность и закрытие", () => {
  const m = new Harness().prepare(true);
  m.finish();
  assert.throws(() => m.run("quality", "close", { reason: "Рано" }));
  m.finish("E");
  m.run("quality", "close", { reason: "Все обязательства выполнены" });
  assert.equal(m.c.stage, "closed");
  assert.equal(caseAge(m.c, m.now), 4);
  assert.ok(auditValid(m.state.events));
});
test("T02: подрядчик, автор подтверждения отличается от внёсшего", () => {
  const m = new Harness().external();
  m.finish();
  m.run("quality", "close", { reason: "Технический результат принят" });
  assert.equal(m.task().attempts[0].source, "Автор подрядчика");
  assert.equal(m.task().attempts[0].uploadedBy, "employee");
});
test("T03: исполнитель, руководитель, admin и неизвестный не закрывают дело", () => {
  const m = new Harness().prepare();
  m.finish();
  const snapshot = JSON.stringify(m.state);
  for (const actor of ["employee", "manager", "admin", "nobody"])
    assert.throws(() => m.run(actor, "close", { reason: "Закрыть" }));
  assert.equal(JSON.stringify(m.state), snapshot);
});
test("T04: обязательное внешнее решение блокирует закрытие", () => {
  const m = new Harness().prepare();
  m.run("quality", "require_decision", {
    subject: "LOT-17",
    decisionType: "Решение по партии",
    responsible: "Уполномоченный человек",
    required: true,
  });
  m.finish();
  assert.throws(() => m.run("quality", "close", { reason: "Рано" }));
  m.run("quality", "record_decision", {
    decisionId: m.c.externalDecisions[0].id,
    reference: "Внешний документ №17",
    author: "Уполномоченный",
    decidedAt: m.now,
    result: "Решение принято во внешнем процессе",
  });
  m.run("quality", "close", { reason: "Основания собраны" });
  assert.equal(m.c.externalDecisions[0].recordedBy, "quality");
});
test("T05: две попытки и два решения после доработки", () => {
  const m = new Harness().prepare();
  m.finish("A", "deficient");
  const first = structuredClone(m.task().attempts[0]);
  m.finish();
  assert.equal(m.task().attempts.length, 2);
  assert.deepEqual(m.task().attempts[0], first);
});
test("T06: отсутствие эффекта требует нового содержательного расследования", () => {
  const m = new Harness().prepare(true);
  m.finish();
  m.finish("E", "ineffective");
  assert.equal(m.c.stage, "investigation");
  assert.throws(() =>
    m.run("quality", "resolve_investigation", { reason: "Просто повторить" }),
  );
  assert.throws(() => m.change("E", { criteria: "Те же условия" }));
  m.investigate(false, true);
  m.change("E", { criteria: "Новый протокол проверки" });
  m.finish("E");
  m.run("quality", "close", { reason: "Новая проверка принята" });
  assert.equal(m.task("A").status, "accepted");
  assert.equal(m.task("E").attempts.length, 2);
});
test("T07: причина может быть неподтверждённой", () => {
  const m = new Harness().prepare(false, true);
  assert.equal(m.c.investigations[0].confirmed, false);
  assert.equal(m.c.investigations[0].cause, "");
  m.finish();
  m.run("quality", "close", { reason: "Неопределённости рассмотрены" });
});
test("T08: передача сохраняет владельца и срок до подтверждения", () => {
  const m = new Harness().prepare();
  const due = m.task().due;
  m.run(
    "employee",
    "request_transfer",
    { toId: "replacement", reason: "Смена" },
    "A",
  );
  assert.equal(m.task().ownerId, "employee");
  assert.throws(() =>
    m.run(
      "manager",
      "decide_transfer",
      { decision: "accepted", reason: "Нет" },
      "A",
    ),
  );
  m.run(
    "replacement",
    "decide_transfer",
    { decision: "accepted", reason: "Принимаю" },
    "A",
  );
  assert.equal(m.task().ownerId, "replacement");
  assert.equal(m.task().performerId, "employee");
  assert.equal(m.task().due, due);
  assert.equal(m.task().assignmentIntervals.length, 2);
});
test("T09: принудительная передача подрядчика меняет сопровождающего", () => {
  const m = new Harness().external();
  assert.throws(() =>
    m.run(
      "employee",
      "force_transfer",
      { toId: "replacement", reason: "Нет полномочий" },
      "A",
    ),
  );
  m.run(
    "manager",
    "force_transfer",
    { toId: "replacement", reason: "Сотрудник отсутствует" },
    "A",
  );
  m.finish();
  assert.equal(m.task().attempts[0].uploadedBy, "replacement");
});
test("T10: ожидание не останавливает возраст и просрочку", () => {
  const m = new Harness().prepare();
  m.run("employee", "accept_assignment", {}, "A");
  m.run("employee", "start_task", {}, "A");
  m.run(
    "employee",
    "wait_task",
    {
      reason: "Поставка",
      dependency: "Деталь",
      ownerId: "manager",
      reviewAt: m.after(24),
    },
    "A",
  );
  m.advance(72);
  assert.equal(caseAge(m.c, m.now), 72);
  assert.ok(overdue(m.task(), m.now));
  assert.ok(
    alerts(m.state, m.now).some((a) => a.title.includes("контроля ожидания")),
  );
  m.run("employee", "resume_task", {}, "A");
  m.advance(2);
  assert.equal(hours(m.task().waits[0].start, m.task().waits[0].end), 72);
});
test("T11: ожидание требует причины, владельца, зависимости и контрольной даты", () => {
  const m = new Harness().prepare();
  m.run("employee", "accept_assignment", {}, "A");
  for (const patch of [
    { reason: "" },
    { ownerId: "nobody" },
    { reviewAt: m.after(-1) },
    { dependency: "" },
  ])
    assert.throws(() =>
      m.run(
        "employee",
        "wait_task",
        {
          reason: "Ждём",
          ownerId: "manager",
          reviewAt: m.after(1),
          dependency: "Ответ",
          ...patch,
        },
        "A",
      ),
    );
  assert.equal(m.task().waits.length, 0);
});
test("T12: перенос сохраняет первоначальный срок и нарушение", () => {
  const m = new Harness().prepare();
  const due = m.task().due;
  m.advance(72);
  m.run(
    "manager",
    "reschedule",
    { due: m.after(24), reason: "Ожидание детали" },
    "A",
  );
  assert.equal(m.task().originalDue, due);
  assert.equal(m.task().deadlineChanges[0].old, due);
  assert.ok(!overdue(m.task(), m.now));
  m.finish();
  const r = report(m.state, "", "", m.now);
  assert.equal(r.onTimeOriginal, 0);
  assert.equal(r.onTimeCurrent, 100);
});
test("T13: посторонний просроченный допуск не блокирует работу", () => {
  const m = new Harness().external(48, true);
  m.finish();
  assert.equal(m.task().status, "accepted");
});
test("T14: перед началом повторно проверяется допуск", () => {
  const m = new Harness().external(1);
  m.run("employee", "accept_assignment", {}, "A");
  m.advance(2);
  assert.throws(() => m.run("employee", "start_task", {}, "A"), /допуска/);
  assert.equal(m.task().attempts.length, 0);
});
test("T15: истечение допуска при работе даёт сигнал без автоматического завершения", () => {
  const m = new Harness().external(1);
  m.run("employee", "accept_assignment", {}, "A");
  m.run("employee", "start_task", {}, "A");
  m.advance(2);
  assert.ok(alerts(m.state, m.now).some((a) => a.title.includes("допуск")));
  assert.equal(m.task().status, "in_progress");
});
test("T16: загрузка допуска не означает одобрение", () => {
  const m = new Harness().external();
  m.run(
    "employee",
    "contractor_permits",
    { permits: m.task().contractor!.permits },
    "A",
  );
  m.run("employee", "accept_assignment", {}, "A");
  assert.throws(() => m.run("employee", "start_task", {}, "A"), /одобрения/);
});
test("T17: прежний план действует до двух согласований новой версии", () => {
  const m = new Harness().prepare();
  const old = m.task().criteria;
  m.change("A", { criteria: "Новые критерии" }, false);
  assert.equal(m.task().criteria, old);
  assert.throws(() =>
    m.run("quality", "review_plan", {
      version: 1,
      decision: "approved",
      reason: "Устаревшее",
    }),
  );
  m.approve(2);
  assert.equal(m.task().criteria, "Новые критерии");
  assert.equal(m.c.activePlanVersion, 2);
});
test("T18: новые критерии после сдачи требуют доработки, доказательства остаются", () => {
  const m = new Harness().prepare();
  m.run("employee", "accept_assignment", {}, "A");
  m.run("employee", "start_task", {}, "A");
  m.run(
    "employee",
    "submit_task",
    { evidence: "Первый протокол", source: "Автор" },
    "A",
  );
  m.change("A", { criteria: "Новый протокол" });
  assert.equal(m.task().status, "rework");
  assert.throws(() =>
    m.run(
      "manager",
      "review_task",
      { decision: "accepted", reason: "Старый результат" },
      "A",
    ),
  );
  m.finish();
  assert.equal(m.task().attempts.length, 2);
  assert.equal(m.task().attempts[0].evidence, "Первый протокол");
});
test("T19: принятую меру нельзя переписать", () => {
  const m = new Harness().prepare();
  m.finish();
  assert.throws(
    () => m.change("A", { criteria: "Задним числом" }),
    /нельзя переписать/,
  );
});
test("T20: эффективность зависит от приёмки мер", () => {
  const m = new Harness().prepare(true);
  m.run("manager", "accept_assignment", {}, "E");
  assert.throws(
    () => m.run("manager", "start_task", {}, "E"),
    /Сначала примите/,
  );
  m.finish();
  m.run("manager", "start_task", {}, "E");
  assert.equal(m.task("E").status, "in_progress");
});
test("T21: позднее событие и ввод имеют разные даты, будущее запрещено", () => {
  const m = new Harness().prepare();
  m.run("employee", "accept_assignment", {}, "A");
  m.advance(4);
  m.run("employee", "start_task", {}, "A", m.after(-2));
  assert.notEqual(
    m.state.events.at(-1)!.occurredAt,
    m.state.events.at(-1)!.recordedAt,
  );
  assert.throws(() =>
    m.run(
      "employee",
      "submit_task",
      { evidence: "Акт", source: "Автор" },
      "A",
      m.after(1),
    ),
  );
});
test("T22: параллельные работы не удваивают возраст дела", () => {
  const m = new Harness();
  m.assess();
  m.investigate();
  m.plan([m.spec("A"), m.spec("B")]);
  for (const id of ["A", "B"]) {
    m.run("employee", "accept_assignment", {}, id);
    m.run("employee", "start_task", {}, id);
  }
  m.advance(8);
  for (const id of ["A", "B"]) {
    m.run(
      "employee",
      "submit_task",
      { evidence: "Протокол", source: "Автор" },
      id,
    );
    m.run(
      "manager",
      "review_task",
      { decision: "accepted", reason: "Принято" },
      id,
    );
  }
  m.run("quality", "close", { reason: "Завершено" });
  assert.equal(caseAge(m.c, m.now), 8);
});
test("T23: закрытое дело не редактируется, изменение истории обнаруживается", () => {
  const m = new Harness().prepare();
  m.finish();
  m.run("quality", "close", { reason: "Завершено" });
  const age = caseAge(m.c, m.now);
  m.advance(24);
  assert.equal(caseAge(m.c, m.now), age);
  assert.throws(() => m.run("quality", "comment", { text: "Переписать" }));
  assert.ok(auditValid(m.state.events));
  m.state.events[0].actorId = "forged";
  assert.ok(!auditValid(m.state.events));
});
test("T24: собственная приёмка запрещена при назначении", () => {
  const m = new Harness();
  m.assess();
  m.investigate();
  assert.throws(
    () =>
      m.plan([m.spec("A", { performerId: "manager", reviewerId: "manager" })]),
    /собственную/,
  );
});
test("T25: отмена меры не отменяет зависимую проверку", () => {
  const m = new Harness().prepare(true);
  m.change("A", { cancelReason: "Обоснованная отмена" });
  assert.equal(m.task("E").status, "assigned");
  assert.throws(() => m.run("quality", "close", { reason: "Рано" }));
  m.change("E", { cancelReason: "Отдельное решение по проверке" });
  m.run("quality", "close", { reason: "Решения рассмотрены" });
});
test("T26: 30 дней наблюдения проверяются управляемыми часами", () => {
  const m = new Harness().prepare(true, false, 720);
  m.finish();
  m.run("manager", "accept_assignment", {}, "E");
  m.advance(719);
  assert.throws(
    () => m.run("manager", "start_task", {}, "E"),
    /период наблюдения/,
  );
  m.advance(1);
  m.finish("E");
  m.run("quality", "close", { reason: "Наблюдение завершено" });
  assert.equal(caseAge(m.c, m.now), 724);
});
test("T27: доработка не может завершиться раньше текущей попытки", () => {
  const m = new Harness().prepare();
  m.finish("A", "deficient");
  m.advance(24);
  m.run("employee", "start_task", {}, "A");
  assert.throws(() =>
    m.run(
      "employee",
      "submit_task",
      { evidence: "Акт", source: "Автор" },
      "A",
      m.after(-1),
    ),
  );
  m.run(
    "employee",
    "submit_task",
    { evidence: "Новый акт", source: "Автор" },
    "A",
  );
  assert.equal(m.task().attempts.length, 2);
});

test("E01: отклонённая команда не меняет ни поля, ни историю", () => {
  const m = new Harness().prepare();
  const before = JSON.stringify(m.state);
  assert.throws(() =>
    m.run(
      "employee",
      "submit_task",
      { evidence: "Нет начала", source: "Автор" },
      "A",
    ),
  );
  assert.equal(JSON.stringify(m.state), before);
});
test("E02: сохранение всех полей и нескольких объектов регистрации", () => {
  const m = new Harness();
  const r = m.run("employee", "register", {
    title: "Несколько объектов",
    description: "Факты",
    detectedAt: m.now,
    department: "Цех",
    line: "TAB-01",
    area: "Зона",
    place: "Место",
    detector: "Очевидец",
    expected: "Ожидаемое",
    actual: "Фактическое",
    immediateActions: "Изолировано",
    impact: "Изучается",
    safety: "Неизвестно",
    amount: "10",
    objects: ["product", "material"].map((kind, i) => ({
      id: `o${i}`,
      kind,
      name: `Объект ${i}`,
      batch: "B1",
      supplierBatch: "S1",
      quantity: "10",
      order: "O1",
      productionStage: "Смешение",
      code: "C1",
    })),
  });
  const c = r.state.cases.find((c) => c.id === r.caseId)!;
  assert.equal(c.objects.length, 2);
  assert.equal(c.place, "Место");
  assert.equal(c.assessments.length, 0);
  assert.notEqual(c.number, m.c.number);
});
test("E03: неверные даты, обязательные поля, размер и тип файлов", () => {
  const m = new Harness();
  for (const detectedAt of ["bad", m.after(1)])
    assert.throws(() =>
      m.run("employee", "register", {
        title: "A",
        description: "B",
        detectedAt,
        department: "Цех",
        line: "L",
      }),
    );
  assert.throws(() =>
    m.run("employee", "register", {
      title: "",
      description: "B",
      detectedAt: m.now,
      department: "Цех",
      line: "L",
    }),
  );
  assert.throws(() => validateFile({ name: "a.exe", size: 2, type: "" }));
  assert.throws(() =>
    validateFile({
      name: "a.pdf",
      size: 21 * 1024 * 1024,
      type: "application/pdf",
    }),
  );
});
test("E04: черновики не выполняют переход и сохраняют итоговое поле причины", () => {
  const m = new Harness();
  m.run("quality", "save_assessment", {
    assessment: {
      severity: "low",
      reason: "Черновик",
      scope: "",
      participants: ["quality"],
      leadId: "manager",
      due: "",
    },
  });
  assert.equal(m.c.stage, "assessment");
  assert.equal(m.c.assessments.length, 0);
  m.assess();
  m.run("manager", "save_investigation", {
    investigation: {
      facts: "Факты",
      chronology: "Хронология",
      participants: ["manager"],
      hypotheses: "Гипотезы",
      evidence: "Доказательства",
      method: "5 почему",
      why: ["1", "2"],
      cause: "Отдельная причина",
      conclusion: "Итог",
      confirmed: true,
      uncertainty: "",
      revision: 0,
    },
  });
  assert.equal(m.c.investigationDraft!.cause, "Отдельная причина");
  assert.equal(m.c.investigations.length, 0);
});
test("E05: отказ передачи, переназначение исполнителя и очередь руководителя", () => {
  const m = new Harness().prepare();
  m.run(
    "employee",
    "request_transfer",
    { toId: "replacement", reason: "Смена" },
    "A",
  );
  m.run(
    "replacement",
    "decide_transfer",
    { decision: "rejected", reason: "Нет ресурсов" },
    "A",
  );
  assert.equal(m.task().ownerId, "employee");
  assert.ok(
    m.state.notifications.some(
      (n) => n.userId === "manager" && n.title.includes("Отклонена"),
    ),
  );
  m.run(
    "manager",
    "replace_assignment",
    {
      function: "performerId",
      toId: "replacement",
      reason: "Новый исполнитель",
    },
    "A",
  );
  assert.equal(m.task().ownerId, "employee");
  assert.equal(m.task().performerId, "replacement");
});
test("E06: циклы и несколько зависимостей", () => {
  const m = new Harness();
  m.assess();
  m.investigate();
  assert.throws(
    () =>
      m.plan([
        m.spec("A", { dependencies: ["B"] }),
        m.spec("B", { dependencies: ["A"] }),
      ]),
    /Циклические/,
  );
  m.plan([
    m.spec("A"),
    m.spec("B"),
    m.spec("E", {
      kind: "effectiveness",
      performerId: "manager",
      reviewerId: "quality",
      dependencies: ["A", "B"],
      method: "Измерение",
    }),
  ]);
  m.finish("A");
  m.run("manager", "accept_assignment", {}, "E");
  assert.throws(() => m.run("manager", "start_task", {}, "E"));
});
test("E07: без мер требует решения, дубль и повтор сохраняют старое дело", () => {
  const m = new Harness();
  m.assess();
  m.investigate();
  assert.ok(closureProblems(m.c).some((x) => x.section === "plan"));
  m.run("quality", "no_measures", {
    reason: "Дальнейшие меры не требуются по оценённым фактам",
  });
  m.run("quality", "close", { reason: "Условия выполнены" });
  const previous = structuredClone(m.c);
  m.run("employee", "register", {
    title: "Повтор",
    description: "Новые факты",
    detectedAt: m.now,
    department: "Цех",
    line: "L",
    relatedCaseId: m.id,
  });
  assert.deepEqual(
    m.state.cases.find((c) => c.id === previous.id),
    previous,
  );
  const duplicateId = m.run("employee", "register", {
    title: "Дубль",
    description: "Те же факты",
    detectedAt: m.now,
    department: "Цех",
    line: "L",
  }).caseId!;
  m.id = duplicateId;
  m.run("quality", "dispose", {
    route: "duplicate",
    relatedCaseId: previous.id,
    reason: "Одно событие",
  });
  assert.equal(m.c.stage, "duplicate");
  assert.equal(m.c.duplicateOf, previous.id);
});
test("E08: реальные отчёты, пустой набор и CSV", () => {
  const r = report(emptyStore(), "", "", new Date().toISOString());
  assert.equal(r.averageClosureHours, undefined);
  assert.equal(r.onTimeOriginal, undefined);
  assert.equal(r.repeat, 0);
  assert.equal(
    csv([["a;b", '"x"', "line\nnext"]]),
    '\uFEFF"a;b";"""x""";"line\nnext"',
  );
});
test("E09: разные роли и отбор по номеру/объектам/сроку", () => {
  const s = makeDemo("2026-10-27T08:00:00.000Z");
  const qa = workQueue(
    s,
    s.people.find((p) => p.id === "quality")!,
  );
  const employee = workQueue(
    s,
    s.people.find((p) => p.id === "employee")!,
  );
  assert.notDeepEqual(qa, employee);
  assert.equal(
    workQueue(
      s,
      s.people.find((p) => p.id === "admin")!,
    ).length,
    0,
  );
  const f = {
    query: "RM-8821",
    view: "all" as const,
    stage: "",
    severity: "",
    area: "",
    owner: "",
    sort: "number",
    direction: "desc" as const,
  };
  assert.equal(
    filterCases(s, f, "quality", "2026-10-27T08:00:00.000Z").length,
    1,
  );
});
test("E10: уведомления о сроках не размножаются, admin не согласует качество", () => {
  const m = new Harness().prepare();
  m.advance(72);
  m.run("quality", "refresh_alerts");
  const count = m.state.notifications.length;
  m.run("quality", "refresh_alerts");
  assert.equal(m.state.notifications.length, count);
  assert.throws(() => m.run("admin", "confirm_assessment", { assessment: {} }));
});
test("E11: устаревшая форма не перезаписывает новую версию", () => {
  const m = new Harness().prepare();
  const expectedRevision = m.state.revision;
  m.run("quality", "comment", { text: "Изменение из другой вкладки" });
  assert.throws(
    () =>
      execute(
        m.state,
        {
          type: "comment",
          actorId: "quality",
          caseId: m.id,
          expectedRevision,
          data: { text: "Старая форма" },
        },
        m.now,
      ),
    /другой вкладке/,
  );
});
test("E12: новая мера добавляется к утверждённому плану, принятая остаётся", () => {
  const m = new Harness().prepare();
  m.finish();
  const accepted = structuredClone(m.task());
  m.plan([toSpec(m.task()), m.spec("B", { relatedTaskId: "A" })]);
  assert.equal(m.task("B").status, "assigned");
  assert.deepEqual(m.task("A"), accepted);
});

test("E13: оценка версионирует объекты, черновик не меняет подтверждённые сведения", () => {
  const m = new Harness();
  m.assess();
  const original = structuredClone(m.c.assessments[0]);
  const assessment = {
    ...original,
    revisionReason: "Уточнены объекты",
    objects: [
      {
        id: "o1",
        kind: "material",
        name: "Сырьё",
        batch: "B1",
        code: "",
        supplierBatch: "S1",
        quantity: "10",
        order: "",
        productionStage: "",
      },
    ],
  };
  m.run("quality", "save_assessment", { assessment });
  assert.equal(m.c.objects.length, 0);
  assert.ok(closureProblems(m.c).some((p) => p.label.includes("черновик")));
  m.run("quality", "confirm_assessment", { assessment });
  assert.equal(m.c.objects[0].supplierBatch, "S1");
  assert.deepEqual(m.c.assessments[0], original);
  assert.equal(m.c.assessments.length, 2);
});
test("E14: приёмка и отмена останавливают интервалы, уточнение сохраняется отдельно", () => {
  const m = new Harness().prepare();
  m.run(
    "employee",
    "annotate_task",
    { note: "Использовать контрольный пример", reason: "Уточнение текста" },
    "A",
  );
  assert.equal(m.task().notes?.length, 1);
  m.finish();
  const interval = structuredClone(m.task().assignmentIntervals.at(-1));
  m.advance(240);
  assert.deepEqual(m.task().assignmentIntervals.at(-1), interval);
  assert.ok(interval?.end);
  m.run("quality", "add_task", { task: m.spec("I", { kind: "immediate" }) });
  assert.throws(() =>
    m.run("employee", "cancel_task", { reason: "Отмена" }, "I"),
  );
  m.run("quality", "cancel_task", { reason: "Необходимость отпала" }, "I");
  assert.equal(m.task("I").status, "cancelled");
  assert.equal(m.task("I").assignmentIntervals[0].end, m.now);
});
test("E15: корректировка фактического времени проверяет последовательность и хранит прежнее значение", () => {
  const m = new Harness().prepare();
  m.finish();
  const attempt = m.task().attempts[0];
  const corrected = new Date(
    Date.parse(attempt.startedAt) + 3600000,
  ).toISOString();
  m.run(
    "quality",
    "correct_time",
    {
      attemptId: attempt.id,
      field: "startedAt",
      value: corrected,
      reason: "Уточнение по журналу",
    },
    "A",
  );
  assert.equal(m.task().attempts[0].startedAt, corrected);
  assert.equal(
    (m.state.events.at(-1)!.before as any).record.tasks.find(
      (t: any) => t.id === "A",
    ).attempts[0].startedAt,
    attempt.startedAt,
  );
  const unchanged = structuredClone(m.state);
  assert.throws(() =>
    m.run(
      "quality",
      "correct_time",
      {
        attemptId: attempt.id,
        field: "finishedAt",
        value: m.after(1),
        reason: "Ошибка",
      },
      "A",
    ),
  );
  assert.deepEqual(m.state, unchanged);
  assert.equal(validDate("2026-02-31T08:00:00.000Z"), false);
});
test("E16: новое согласование не теряет историю документов, версия не может разветвиться", () => {
  const m = new Harness();
  const f = {
    id: "f1",
    name: "proof.txt",
    type: "text/plain",
    size: 3,
    source: "Внешний автор",
    occurredAt: m.now,
  };
  m.run("employee", "attach", { documents: [f] });
  m.run("employee", "attach", {
    documents: [{ ...f, id: "f2", previousId: "f1" }],
  });
  assert.deepEqual(
    m.state.documents.map((d) => d.version),
    [1, 2],
  );
  assert.equal((m.state.events.at(-1)!.before as any).documents.length, 1);
  assert.equal((m.state.events.at(-1)!.after as any).documents.length, 2);
  assert.throws(
    () =>
      m.run("employee", "attach", {
        documents: [{ ...f, id: "f3", previousId: "f1" }],
      }),
    /последнюю/,
  );
  assert.equal(m.state.documents.length, 2);
});
test("E17: передача администратору запрещена, завершение вне области останавливает ответственность", () => {
  const m = new Harness().prepare();
  assert.throws(
    () =>
      m.run(
        "manager",
        "force_transfer",
        { toId: "admin", reason: "Ошибка назначения" },
        "A",
      ),
    /Администратор/,
  );
  const n = new Harness();
  n.advance(24);
  n.run("quality", "dispose", {
    route: "out_of_scope",
    reason: "Обращение относится к другому процессу",
  });
  assert.equal(n.c.stage, "out_of_scope");
  assert.equal(n.c.ownerIntervals[0].end, n.now);
});
test("E18: обзор за весь период включает legacy без вымышленных времён", () => {
  const s = emptyStore();
  const m = new Harness();
  const old = structuredClone(m.c);
  old.registeredAt = undefined;
  old.stage = "unknown";
  old.stageIntervals = [];
  old.legacy = {
    raw: { severity: "Критическое" },
    status: "Просрочено",
    needsClarification: true,
    notes: [],
  };
  s.cases.push(old);
  const all = report(s, "", "", m.now);
  assert.equal(all.open, 1);
  assert.equal(all.averageClosureHours, undefined);
  assert.equal(report(s, "2026-10-01", "2026-10-31", m.now).cases.length, 0);
  assert.equal(
    filterCases(
      s,
      {
        query: "",
        view: "all",
        stage: "",
        severity: "critical",
        area: "",
        owner: "",
        sort: "number",
        direction: "asc",
      },
      "quality",
      m.now,
    ).length,
    1,
  );
});
