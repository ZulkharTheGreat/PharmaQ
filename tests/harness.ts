import { emptyStore } from "../lib/demo/people";
import { execute } from "../lib/domain/commands";
import { CommandType, TaskSpec } from "../lib/domain/types";
import { toSpec } from "../lib/domain/case-commands";
import { HOUR } from "../lib/domain/time";
export class Harness {
  state = emptyStore();
  now = "2026-10-27T08:00:00.000Z";
  id = "";
  constructor(now?: string) {
    if (now) this.now = now;
    this.state.people.push(
      {
        id: "replacement",
        name: "Другой сотрудник",
        role: "employee",
        department: "Производство",
        active: true,
      },
      {
        id: "quality2",
        name: "Второй специалист качества",
        role: "quality",
        department: "Качество",
        active: true,
      },
    );
    this.id = this.run("employee", "register", {
      title: "Отклонение процесса",
      description: "Обнаружены факты отклонения",
      detectedAt: this.now,
      department: "Производство",
      line: "TAB-01",
      objects: [],
    }).caseId!;
  }
  get c() {
    return this.state.cases.find((c) => c.id === this.id)!;
  }
  task(id = "A") {
    return this.c.tasks.find((t) => t.id === id)!;
  }
  run(
    actorId: string,
    type: CommandType,
    data: Record<string, unknown> = {},
    taskId?: string,
    occurredAt?: string,
  ) {
    const r = execute(
      this.state,
      {
        actorId,
        type,
        expectedRevision: this.state.revision,
        caseId:
          type === "register" ||
          ["update_settings", "upsert_reference", "refresh_alerts"].includes(
            type,
          )
            ? undefined
            : this.id,
        taskId,
        data,
        occurredAt,
      },
      this.now,
    );
    this.state = r.state;
    return r;
  }
  advance(h: number) {
    this.now = this.after(h);
  }
  after(h: number) {
    return new Date(Date.parse(this.now) + h * HOUR).toISOString();
  }
  assess() {
    this.run("quality", "confirm_assessment", {
      assessment: {
        severity: "high",
        reason: "Основание оценки",
        scope: "Проверить процесс",
        participants: ["quality", "manager"],
        leadId: "manager",
        due: this.after(1000),
      },
    });
  }
  investigate(unknown = false, revision = false) {
    this.run("manager", "submit_investigation", {
      investigation: {
        facts: revision ? "Новые данные о процессе" : "Факты",
        hypotheses: revision ? "Новая гипотеза" : "Проверены гипотезы",
        evidence: revision ? "Новый протокол" : "Протокол обследования",
        conclusion: revision ? "Пересмотренный вывод" : "Вывод",
        cause: unknown ? "" : "Установленная причина",
        confirmed: !unknown,
        uncertainty: unknown ? "Ограничения доказательств" : "",
        participants: ["manager", "employee"],
        method: "Анализ фактов",
        revisionReason: revision ? "Получены новые данные" : "",
      },
    });
    this.run("quality", "resolve_investigation", {
      reason: "Вывод рассмотрен, дальнейшие меры обоснованы",
    });
  }
  spec(id = "A", patch: Partial<TaskSpec> = {}): TaskSpec {
    return {
      id,
      measureId: `measure-${id}`,
      kind: "action",
      title: `Мера ${id}`,
      outcome: "Ожидаемый результат",
      ownerId: "employee",
      performerId: "employee",
      reviewerId: "manager",
      due: this.after(48),
      criteria: "Проверка по заданию",
      requiredEvidence: "Протокол",
      required: true,
      dependencies: [],
      observationHours: 0,
      method: "",
      ...patch,
    };
  }
  plan(specs: TaskSpec[], approve = true) {
    this.run("manager", "save_plan", {
      tasks: specs,
      technicalApproverId: "manager",
      reason: "Меры и критерии достаточны",
    });
    const version = this.c.activePlanVersion + 1;
    this.run("manager", "submit_plan", { version });
    if (approve) this.approve(version);
  }
  approve(version = this.c.activePlanVersion + 1) {
    this.run("manager", "review_plan", {
      version,
      decision: "approved",
      reason: "Техническая оценка",
    });
    this.run("quality", "review_plan", {
      version,
      decision: "approved",
      reason: "Оценка качества",
    });
  }
  prepare(check = false, unknown = false, observationHours = 0) {
    this.assess();
    this.investigate(unknown);
    const a = this.spec();
    this.plan(
      check
        ? [
            a,
            this.spec("E", {
              kind: "effectiveness",
              ownerId: "manager",
              performerId: "manager",
              reviewerId: "quality2",
              dependencies: ["A"],
              observationHours,
              method: "Проверка после наблюдения",
              due: this.after(2000),
            }),
          ]
        : [a],
    );
    return this;
  }
  finish(id = "A", decision = "accepted") {
    const performer = this.task(id).performerId,
      reviewer = this.task(id).reviewerId;
    if (this.task(id).status === "assigned")
      this.run(performer, "accept_assignment", {}, id);
    this.run(performer, "start_task", {}, id);
    this.advance(2);
    this.run(
      performer,
      "submit_task",
      {
        evidence: "Протокол результата",
        source: this.task(id).contractor
          ? "Автор подрядчика"
          : "Автор документа",
        documentIds: [],
      },
      id,
    );
    this.run(
      reviewer,
      "review_task",
      { decision, reason: "Подтверждённое решение" },
      id,
    );
  }
  change(id: string, patch: Partial<TaskSpec>, approve = true) {
    this.plan(
      this.c.tasks
        .filter((t) => ["action", "effectiveness"].includes(t.kind))
        .map((t) => ({ ...toSpec(t), ...(t.id === id ? patch : {}) })),
      approve,
    );
  }
  external(validHours = 48, extra = false) {
    this.assess();
    this.investigate();
    this.plan([
      this.spec("A", {
        contractor: {
          contractorId: "vendor-1",
          scope: "Ремонт",
          zone: "TAB-01",
          people: "Инженер подрядчика",
          tools: "Комплект инструмента",
          requirements: ["repair"],
          permits: [],
          events: [],
        },
      }),
    ]);
    const permits = [
      {
        id: "p1",
        scope: "repair",
        zone: "TAB-01",
        people: "Инженер подрядчика",
        tools: "Комплект инструмента",
        expiresAt: this.after(validHours),
        reference: "Допуск №1",
      },
    ];
    if (extra)
      permits.push({
        ...permits[0],
        id: "p2",
        scope: "unrelated",
        expiresAt: this.after(-1),
      });
    this.run("employee", "contractor_permits", { permits }, "A");
    this.run(
      "quality",
      "approve_contractor",
      { reason: "Пригодность подтверждена профильным заключением" },
      "A",
    );
    return this;
  }
}
