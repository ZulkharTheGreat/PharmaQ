import { Deviation, Person, Store, Task, Severity } from "./types";
import { isClosed, participates, taskDone } from "./permissions";
import { contractorProblems } from "./helpers";
import { HOUR, hours } from "./time";
export function severityOf(c: Deviation): Severity | undefined {
  const confirmed = c.assessments.at(-1)?.severity;
  if (confirmed) return confirmed;
  const legacy = String(c.legacy?.raw.severity || "").toLowerCase();
  if (/critical|критич/.test(legacy)) return "critical";
  if (/high|высок/.test(legacy)) return "high";
  if (/medium|средн/.test(legacy)) return "medium";
  if (/low|низк/.test(legacy)) return "low";
}
export function overdue(c: Deviation | Task, now: string) {
  return !!c.due && now > c.due && ("stage" in c ? !isClosed(c) : !taskDone(c));
}
export function caseAge(c: Deviation, now: string) {
  return hours(c.registeredAt, c.closedAt || now);
}
export function stageAge(c: Deviation, now: string) {
  const i = c.stageIntervals.at(-1);
  return hours(i?.start, i?.end || c.closedAt || now);
}
export interface WorkItem {
  id: string;
  caseId: string;
  taskId?: string;
  title: string;
  category: "incoming" | "doing" | "review" | "waiting";
  function: string;
  due?: string;
  section: string;
}
export function workQueue(s: Store, p: Person): WorkItem[] {
  const result: WorkItem[] = [];
  if (p.role === "admin") return result;
  for (const c of s.cases.filter((c) => !isClosed(c))) {
    for (const t of c.tasks.filter((t) => !taskDone(t))) {
      const tr = t.transfers.find((r) => !r.decision && r.toId === p.id);
      if (tr)
        result.push({
          id: tr.id,
          caseId: c.id,
          taskId: t.id,
          title: `Принять ответственность: ${t.title}`,
          category: "incoming",
          function: "Новый ответственный",
          due: t.due,
          section: `task:${t.id}`,
        });
      if (t.status === "submitted" && t.reviewerId === p.id)
        result.push({
          id: `${t.id}:review`,
          caseId: c.id,
          taskId: t.id,
          title: `Принять результат: ${t.title}`,
          category: "review",
          function: "Принимающий",
          due: t.due,
          section: `task:${t.id}`,
        });
      else if ([t.ownerId, t.performerId].includes(p.id))
        result.push({
          id: t.id,
          caseId: c.id,
          taskId: t.id,
          title: t.title,
          category:
            t.status === "waiting"
              ? "waiting"
              : t.status === "assigned"
                ? "incoming"
                : "doing",
          function: t.performerId === p.id ? "Исполнитель" : "Ответственный",
          due: t.due,
          section:
            t.kind === "assessment"
              ? "assessment"
              : t.kind === "investigation"
                ? "investigation"
                : `task:${t.id}`,
        });
    }
    const incoming = c.ownerTransfers.find(
      (t) => !t.decision && t.toId === p.id,
    );
    if (incoming)
      result.push({
        id: incoming.id,
        caseId: c.id,
        title: "Принять ответственность за дело",
        category: "incoming",
        function: "Координатор",
        due: c.due,
        section: "details",
      });
    const i = c.investigations.at(-1);
    if (p.role === "quality" && i && !i.qualityDecision)
      result.push({
        id: `${c.id}:investigation:${i.revision}`,
        caseId: c.id,
        title: "Рассмотреть вывод расследования",
        category: "review",
        function: "Качество",
        due: c.due,
        section: "investigation",
      });
    const plan = c.plans.find((x) => x.status === "submitted");
    if (
      plan &&
      (p.role === "quality" || plan.technicalApproverId === p.id) &&
      !plan.decisions.some(
        (d) =>
          d.function === (p.role === "quality" ? "quality" : "technical") &&
          d.decision === "approved",
      )
    )
      result.push({
        id: `${c.id}:plan:${plan.version}:${p.id}`,
        caseId: c.id,
        title: `Согласовать план v${plan.version}`,
        category: "review",
        function: p.role === "quality" ? "Качество" : "Профильный специалист",
        due: c.due,
        section: "plan",
      });
    if (p.id === c.leadId && c.stage === "plan" && !plan)
      result.push({
        id: `${c.id}:plan`,
        caseId: c.id,
        title: "Подготовить план мер",
        category: "doing",
        function: "Руководитель расследования",
        due: c.due,
        section: "plan",
      });
    if (c.stage === "closure" && p.role === "quality")
      result.push({
        id: `${c.id}:close`,
        caseId: c.id,
        title: "Рассмотреть закрытие дела",
        category: "review",
        function: "Уполномоченный качества",
        due: c.due,
        section: "closure",
      });
    if (c.legacy?.needsClarification && p.role === "quality")
      result.push({
        id: `${c.id}:legacy`,
        caseId: c.id,
        title: "Уточнить прежнюю запись",
        category: "incoming",
        function: "Качество",
        due: c.due,
        section: "legacy",
      });
  }
  return result.sort((a, b) => (a.due || "z").localeCompare(b.due || "z"));
}
export function alerts(s: Store, now: string) {
  const result: {
    id: string;
    userId: string;
    title: string;
    caseId: string;
    taskId?: string;
  }[] = [];
  for (const c of s.cases.filter((c) => !isClosed(c))) {
    if (overdue(c, now))
      result.push({
        id: `${c.id}:due:${c.due}`,
        userId: c.coordinatorId,
        title: `Просрочено дело ${c.number}`,
        caseId: c.id,
      });
    for (const t of c.tasks.filter((t) => !taskDone(t))) {
      const add = (key: string, title: string, userId = t.ownerId) =>
        result.push({
          id: `${t.id}:${key}`,
          userId,
          title: `${title}: ${t.title}`,
          caseId: c.id,
          taskId: t.id,
        });
      if (overdue(t, now)) add(`due:${t.due}`, "Срок нарушен");
      else if (
        t.due &&
        Date.parse(t.due) - Date.parse(now) <= s.settings.alertHours * HOUR
      )
        add(`soon:${t.due}`, "Приближается срок");
      if (
        t.status === "assigned" &&
        t.createdAt &&
        Date.parse(now) - Date.parse(t.createdAt) >=
          s.settings.assignmentAlertHours * HOUR
      )
        add(`assignment:${t.createdAt}`, "Назначение не принято");
      const wait = t.waits.at(-1);
      if (wait && !wait.end && now >= wait.reviewAt)
        add(
          `wait:${wait.id}`,
          "Наступила дата контроля ожидания",
          wait.ownerId,
        );
      if (
        t.contractor &&
        t.status === "in_progress" &&
        contractorProblems(t.contractor, now).length
      )
        add(
          `permit:${t.contractor.approvedAt || "none"}:${t.contractor.permits.map((p) => p.expiresAt).join(",")}`,
          "Проверьте допуск подрядчика",
        );
    }
  }
  return result;
}
export interface RegistryFilter {
  query: string;
  view: "all" | "mine" | "overdue";
  stage: string;
  severity: string;
  area: string;
  owner: string;
  sort: string;
  direction: "asc" | "desc";
}
export function filterCases(
  s: Store,
  f: RegistryFilter,
  userId: string,
  now: string,
) {
  return s.cases
    .filter(
      (c) =>
        (!f.query ||
          [
            c.title,
            c.number,
            c.line,
            ...c.objects.flatMap((x) => [
              x.name,
              x.batch,
              x.supplierBatch,
              x.code,
            ]),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(f.query.toLocaleLowerCase())) &&
        (f.view !== "mine" || participates(c, userId)) &&
        (f.view !== "overdue" || overdue(c, now)) &&
        (!f.stage || c.stage === f.stage) &&
        (!f.severity || severityOf(c) === f.severity) &&
        (!f.area || c.line === f.area) &&
        (!f.owner || c.coordinatorId === f.owner),
    )
    .sort((a, b) => {
      const get = (c: Deviation) =>
        f.sort === "stage"
          ? c.stage
          : f.sort === "due"
            ? c.due || "z"
            : f.sort === "title"
              ? c.title
              : f.sort === "owner"
                ? s.people.find((p) => p.id === c.coordinatorId)?.name || ""
                : f.sort === "stageAge"
                  ? stageAge(c, now) || 0
                  : f.sort === "area"
                    ? c.line
                    : c.number;
      const av = get(a),
        bv = get(b);
      return (
        (typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "ru", { numeric: true })) *
        (f.direction === "asc" ? 1 : -1)
      );
    });
}
export function report(s: Store, from: string, to: string, now: string) {
  const cases = s.cases.filter(
    (c) =>
      (!from && !to) ||
      (!!c.registeredAt &&
        (!from || c.registeredAt.slice(0, 10) >= from) &&
        (!to || c.registeredAt.slice(0, 10) <= to)),
  );
  const completed = cases.filter(
    (c) => c.stage === "closed" && c.closedAt && c.registeredAt && !c.legacy,
  );
  const tasks = cases
    .flatMap((c) => c.tasks)
    .filter(
      (t) =>
        !["assessment", "investigation"].includes(t.kind) &&
        t.status === "accepted" &&
        t.acceptedAt &&
        t.due &&
        t.originalDue,
    );
  const onTime = (original: boolean) =>
    tasks.length
      ? (tasks.filter(
          (t) => t.acceptedAt! <= (original ? t.originalDue! : t.due),
        ).length /
          tasks.length) *
        100
      : undefined;
  const byStage: Record<string, number> = {};
  for (const c of cases)
    for (const interval of c.stageIntervals)
      byStage[interval.value] =
        (byStage[interval.value] || 0) +
        (hours(interval.start, interval.end || c.closedAt || now) || 0);
  return {
    cases,
    open: cases.filter((c) => !isClosed(c)).length,
    overdue: cases.filter((c) => overdue(c, now)).length,
    completed: completed.length,
    averageClosureHours: completed.length
      ? completed.reduce((n, c) => n + (caseAge(c, now) || 0), 0) /
        completed.length
      : undefined,
    onTimeOriginal: onTime(true),
    onTimeCurrent: onTime(false),
    repeat: cases.filter((c) => c.relatedCaseId).length,
    byStage,
    waitingHours: cases
      .flatMap((c) => c.tasks)
      .flatMap((t) => t.waits)
      .reduce((n, w) => n + (hours(w.start, w.end || now) || 0), 0),
  };
}
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (/^[=+@\-]/.test(text)) text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
