import { Deviation, Stage, Store, Task } from "../domain/types";
import { emptyStore } from "../demo/people";
import { legacyDate } from "../domain/time";
import { requireRule } from "../domain/permissions";
import { str } from "../domain/helpers";
export function migrateLegacy(
  raw: string,
  now: string,
  initial = emptyStore(),
): Store {
  if (initial.migration?.version === 1) return initial;
  const parsed: unknown = JSON.parse(raw);
  requireRule(
    Array.isArray(parsed),
    "Старые данные должны содержать массив отклонений",
  );
  const state = structuredClone(initial);
  const warnings: string[] = [];
  const resolvePerson = (value: unknown, fallback = "quality") => {
    const name = str(value);
    if (!name || name === "Не назначен" || name === "—") return fallback;
    const found = state.people.filter(
      (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (found.length === 1) return found[0].id;
    const id = `legacy-person-${state.people.length}`;
    state.people.push({
      id,
      name,
      role: "employee",
      department: "",
      active: true,
      legacy: true,
    });
    if (found.length > 1)
      warnings.push(`Неоднозначное имя: ${name}. Сохранён отдельный участник`);
    return id;
  };
  const stages: Record<string, Stage> = {
    Черновик: "assessment",
    Зарегистрировано: "assessment",
    Классификация: "assessment",
    Расследование: "investigation",
    "Выполнение CAPA": "execution",
    "Проверка эффективности": "effectiveness",
    Закрыто: "closed",
    Отклонено: "out_of_scope",
    Просрочено: "unknown",
  };
  for (let index = 0; index < parsed.length; index++) {
    const r = parsed[index];
    requireRule(
      r && typeof r === "object" && !Array.isArray(r),
      `Повреждена запись ${index + 1}`,
    );
    const rawRecord = r as Record<string, unknown>;
    const id = `legacy-${String(rawRecord.id ?? index)}-${index}`;
    if (state.cases.some((c) => c.id === id)) continue;
    const status = str(rawRecord.status);
    const number = str(rawRecord.number) || `LEGACY-${index + 1}`;
    const match = /^DEV-(\d{4})-(\d+)$/.exec(number);
    if (match)
      state.counters[match[1]] = Math.max(
        state.counters[match[1]] || 0,
        Number(match[2]),
      );
    const ownerId = resolvePerson(rawRecord.owner);
    const dueDay = legacyDate(rawRecord.due);
    const notes = [
      "Прежняя история и точные времена событий отсутствуют. Исходная запись сохранена полностью.",
    ];
    if (status === "Просрочено")
      notes.push(
        "В старой записи просрочка заменяла этап. Фактический этап требует уточнения.",
      );
    if (rawRecord.date)
      notes.push(`Исходная дата (без времени): ${String(rawRecord.date)}`);
    if (!dueDay && rawRecord.due)
      notes.push(`Не удалось разобрать срок: ${String(rawRecord.due)}`);
    const c: Deviation = {
      id,
      number,
      revision: 1,
      title: str(rawRecord.title) || "Без названия (прежняя запись)",
      description: str(rawRecord.description),
      enteredAt: now,
      authorId: resolvePerson(rawRecord.author, ownerId),
      department: str(rawRecord.department),
      line: str(rawRecord.line),
      area: str(rawRecord.area),
      place: str(rawRecord.place),
      detector: str(rawRecord.detector),
      expected: str(rawRecord.expected),
      actual: str(rawRecord.actual),
      immediateActions: str(rawRecord.actions),
      impact: str(rawRecord.impact),
      safety: str(rawRecord.safety),
      amount: str(rawRecord.amount),
      objects: [],
      stage: stages[status] || "unknown",
      coordinatorId: ownerId,
      leadId: state.settings.investigatorId,
      originalDue: dueDay,
      due: dueDay,
      deadlineChanges: [],
      assessments: [],
      investigations: [],
      pendingReconsideration: false,
      plans: [],
      activePlanVersion: 0,
      tasks: [],
      externalDecisions: [],
      stageIntervals: [],
      ownerIntervals: [],
      ownerTransfers: [],
      comments: [],
      legacy: {
        raw: structuredClone(rawRecord),
        status,
        needsClarification: !["Закрыто", "Отклонено"].includes(status),
        notes,
      },
    };
    if (str(rawRecord.product) && rawRecord.product !== "—")
      c.objects.push({
        id: `${id}-object`,
        kind: /сырь|материал/i.test(c.title) ? "material" : "product",
        name: str(rawRecord.product),
        batch: rawRecord.batch === "—" ? "" : str(rawRecord.batch),
        code: str(rawRecord.code),
        supplierBatch: str(rawRecord.supplierBatch),
        quantity: str(rawRecord.size),
        order: str(rawRecord.order),
        productionStage: str(rawRecord.productionStage),
      });
    if (Array.isArray(rawRecord.comments))
      c.comments = rawRecord.comments.map((value, i) => {
        const v = value as Record<string, unknown>;
        return {
          id: `${id}-comment-${i}`,
          authorId: resolvePerson(v.author),
          text: str(v.text),
          legacyTime: str(v.time),
        };
      });
    if (Array.isArray(rawRecord.capa))
      c.tasks = rawRecord.capa.map((value, i): Task => {
        const v = value as Record<string, unknown>;
        const owner = resolvePerson(v.owner, ownerId);
        return {
          id: `${id}-task-${i}`,
          measureId: `${id}-measure-${i}`,
          kind: "action",
          title: str(v.title),
          outcome: "",
          ownerId: owner,
          performerId: owner,
          reviewerId: "quality",
          due: legacyDate(v.due) || "",
          originalDue: legacyDate(v.due),
          criteria: "",
          requiredEvidence: "",
          required: true,
          dependencies: [],
          observationHours: 0,
          method: "",
          status: "legacy",
          assignmentIntervals: [],
          attempts: [],
          waits: [],
          transfers: [],
          deadlineChanges: [],
          legacyRaw: structuredClone(v),
        };
      });
    state.cases.push(c);
  }
  state.migration = { version: 1, at: now, count: parsed.length, warnings };
  return state;
}
