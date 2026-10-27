import { Deviation, Person, Store, Task } from "./types";
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
export function requireRule(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new RuleError(message);
}
export function isQuality(p: Person) {
  return p.role === "quality";
}
export function isManager(p: Person) {
  return p.role === "manager";
}
export function canInvestigate(p: Person, c: Deviation) {
  return p.id === c.leadId && (p.role === "manager" || p.role === "quality");
}
export function isClosed(c: Deviation) {
  return ["closed", "duplicate", "out_of_scope"].includes(c.stage);
}
export function taskDone(t: Task) {
  return ["accepted", "cancelled"].includes(t.status);
}
export function participates(c: Deviation, id: string) {
  return (
    !isClosed(c) &&
    (c.coordinatorId === id ||
      c.tasks.some(
        (t) =>
          !taskDone(t) && [t.ownerId, t.performerId, t.reviewerId].includes(id),
      ) ||
      c.ownerTransfers.some((t) => !t.decision && t.toId === id))
  );
}
export function person(s: Store, id: string) {
  return s.people.find((p) => p.id === id)?.name || "Неизвестный участник";
}
