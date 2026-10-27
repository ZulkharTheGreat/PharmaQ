import { emptyStore } from "./people";
import { execute } from "../domain/commands";
import { Command, Store, TaskSpec } from "../domain/types";
import { DAY } from "../domain/time";
export function makeDemo(now: string): Store {
  let state = emptyStore();
  const titles = [
    "Температура хранения",
    "Ошибка маркировки",
    "Параметры таблетирования",
    "Повреждение блистера",
    "Несоответствие сырья",
    "Отклонение массы",
    "Срок хранения материала",
    "Сбой подачи воздуха",
    "Запись в журнале производства",
    "Отклонение влажности",
    "Контроль упаковочной линии",
    "Проверка весов",
  ];
  const areas = [
    "WH-02",
    "PKG-03",
    "TAB-01",
    "BLI-04",
    "QC-LAB",
    "TAB-02",
    "WH-01",
    "HVAC-07",
  ];
  const products = [
    "Амоксициллин 500 мг",
    "Парацетамол 500 мг",
    "Ибупрофен 200 мг",
    "Цетиризин 10 мг",
    "Лактоза моногидрат",
  ];
  for (let n = titles.length - 1; n >= 0; n--) {
    const at = new Date(Date.parse(now) - (n + 2) * DAY).toISOString();
    const due = new Date(
      Date.parse(now) + (n === 1 || n === 6 ? -1 : n + 2) * DAY,
    ).toISOString();
    const run = (
      actorId: string,
      type: Command["type"],
      data: Record<string, unknown> = {},
      caseId?: string,
      taskId?: string,
      when = at,
    ) => {
      const r = execute(
        state,
        {
          type,
          actorId,
          expectedRevision: state.revision,
          caseId,
          taskId,
          data,
        },
        when,
      );
      state = r.state;
      return r.caseId!;
    };
    const id = run("employee", "register", {
      title: titles[n],
      description:
        "Демонстрационный пример: при производственном контроле обнаружено отклонение. Требуется оценить факты и определить дальнейшие действия.",
      detectedAt: at,
      department: n === 4 ? "Контроль качества" : "Производство",
      line: areas[n % areas.length],
      immediateActions: "Информация передана координатору качества.",
      objects: [
        {
          id: `demo-object-${n}`,
          kind: n === 4 ? "material" : "product",
          name: products[n % products.length],
          batch: `LOT-26${100 + n}`,
          code: "",
          supplierBatch: n === 4 ? "RM-8821" : "",
          quantity: "",
          order: "",
          productionStage: "",
        },
      ],
    });
    state.cases.find((c) => c.id === id)!.demo = true;
    if (n === 4 || n > 8) continue;
    run(
      "quality",
      "confirm_assessment",
      {
        assessment: {
          severity: n === 0 ? "critical" : n === 1 ? "high" : "medium",
          reason:
            "Демо: оценено возможное влияние на процесс и затронутый объект.",
          scope: "Проверить журнал, параметры процесса и организацию контроля.",
          participants: ["quality", "manager"],
          leadId: "manager",
          due,
        },
      },
      id,
    );
    if (n === 0 || n === 7) continue;
    run(
      "manager",
      "submit_investigation",
      {
        investigation: {
          facts:
            "Демо: сопоставлены записи контроля и последовательность операций.",
          chronology: "Обнаружение, первичные действия, проверка журнала.",
          participants: ["manager", "employee"],
          hypotheses: "Проверены настройка процесса и порядок контроля.",
          evidence: "Демонстрационные результаты обследования.",
          method: "Анализ фактов",
          conclusion: "Требуется уточнить порядок контроля.",
          cause: "Недостаточная детализация контрольной операции.",
          confirmed: true,
          uncertainty: "",
          revision: 1,
        },
      },
      id,
    );
    run(
      "quality",
      "resolve_investigation",
      { reason: "Демо: вывод рассмотрен, подготовить меры." },
      id,
    );
    if (n === 5) continue;
    const spec: TaskSpec = {
      id: `demo-task-${n}`,
      measureId: `demo-measure-${n}`,
      kind: "action",
      title:
        n === 1
          ? "Обновить контроль маркировки"
          : "Уточнить контрольную операцию",
      outcome: "Проверяемый порядок контроля",
      ownerId: "employee",
      performerId: "employee",
      reviewerId: "manager",
      due,
      criteria: "Выполнена проверка на контрольном примере",
      requiredEvidence: "Протокол проверки с результатами",
      required: true,
      dependencies: [],
      observationHours: 0,
      method: "",
    };
    const check: TaskSpec = {
      ...spec,
      id: `demo-check-${n}`,
      measureId: "",
      kind: "effectiveness",
      title: "Проверить устойчивость результата",
      ownerId: "manager",
      performerId: "manager",
      reviewerId: "quality",
      dependencies: [spec.id],
      observationHours: 24,
      method: "Анализ наблюдений после внедрения",
      due: new Date(Date.parse(now) + 14 * DAY).toISOString(),
    };
    run(
      "manager",
      "save_plan",
      {
        tasks: [spec, check],
        technicalApproverId: "manager",
        reason: "Демонстрационный план с проверкой эффективности",
      },
      id,
    );
    run("manager", "submit_plan", { version: 1 }, id);
    run(
      "manager",
      "review_plan",
      {
        version: 1,
        decision: "approved",
        reason: "Демо: техническая часть проверена",
      },
      id,
    );
    run(
      "quality",
      "review_plan",
      {
        version: 1,
        decision: "approved",
        reason: "Демо: план рассмотрен качеством",
      },
      id,
    );
    run("employee", "accept_assignment", {}, id, spec.id);
    run("employee", "start_task", {}, id, spec.id);
    if (n === 2 || n === 3 || n === 8)
      run(
        "employee",
        "submit_task",
        {
          evidence: "Демо: контрольная операция проверена",
          source: "Демонстрационный протокол",
        },
        id,
        spec.id,
      );
    if (n === 3 || n === 8) {
      run(
        "manager",
        "review_task",
        { decision: "accepted", reason: "Демо: критерии выполнены" },
        id,
        spec.id,
      );
      run("manager", "accept_assignment", {}, id, check.id);
    }
  }
  return state;
}
