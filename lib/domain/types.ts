export type Role = "employee" | "quality" | "manager" | "admin";
export type Stage =
  | "assessment"
  | "investigation"
  | "plan"
  | "execution"
  | "acceptance"
  | "effectiveness"
  | "closure"
  | "closed"
  | "duplicate"
  | "out_of_scope"
  | "unknown";
export type Severity = "low" | "medium" | "high" | "critical";
export type TaskStatus =
  | "assigned"
  | "ready"
  | "in_progress"
  | "waiting"
  | "submitted"
  | "rework"
  | "accepted"
  | "cancelled"
  | "ineffective"
  | "legacy";
export type TaskKind =
  | "assessment"
  | "investigation"
  | "clarification"
  | "immediate"
  | "action"
  | "effectiveness";
export interface Person {
  id: string;
  name: string;
  role: Role;
  email?: string;
  department: string;
  active: boolean;
  legacy?: boolean;
}
export interface Reference {
  id: string;
  name: string;
  active: boolean;
}
export interface AffectedObject {
  id: string;
  kind: "product" | "batch" | "material" | "equipment" | "area";
  name: string;
  batch: string;
  code: string;
  supplierBatch: string;
  quantity: string;
  order: string;
  productionStage: string;
}
export interface Interval {
  start: string;
  end?: string;
  value: string;
}
export interface Assessment {
  objects?: AffectedObject[];
  severity: Severity;
  reason: string;
  category: string;
  impact: string;
  safety: string;
  scope: string;
  participants: string[];
  leadId: string;
  due: string;
  revisionReason: string;
  confirmedAt?: string;
  authorId?: string;
}
export interface Investigation {
  facts: string;
  chronology: string;
  participants: string[];
  hypotheses: string;
  evidence: string;
  method: string;
  why: string[];
  conclusion: string;
  cause: string;
  confirmed: boolean;
  uncertainty: string;
  revisionReason: string;
  revision: number;
  submittedAt?: string;
  authorId?: string;
  qualityDecision?: string;
  decidedAt?: string;
  decidedBy?: string;
}
export interface Attempt {
  id: string;
  startedAt: string;
  finishedAt?: string;
  submittedAt?: string;
  evidence?: string;
  source?: string;
  uploadedBy?: string;
  documentIds: string[];
  decision?: "accepted" | "deficient" | "ineffective" | "superseded";
  reason?: string;
  reviewedAt?: string;
  reviewerId?: string;
}
export interface Wait {
  id: string;
  start: string;
  end?: string;
  reason: string;
  dependency: string;
  ownerId: string;
  reviewAt: string;
  resumeStatus: TaskStatus;
}
export interface Transfer {
  id: string;
  fromId: string;
  toId: string;
  reason: string;
  requestedAt: string;
  decidedAt?: string;
  decision?: "accepted" | "rejected" | "forced";
  decisionReason?: string;
}
export interface DeadlineChange {
  old?: string;
  due: string;
  reason: string;
  actorId: string;
  at: string;
}
export interface Permit {
  id: string;
  scope: string;
  zone: string;
  people: string;
  tools: string;
  expiresAt: string;
  reference: string;
}
export interface Contractor {
  id: string;
  name: string;
  specialty: string;
  contact: string;
  active: boolean;
}
export interface ContractorWork {
  contractorId: string;
  scope: string;
  zone: string;
  people: string;
  tools: string;
  requirements: string[];
  permits: Permit[];
  approvedBy?: string;
  approvedAt?: string;
  approvalReason?: string;
  calledAt?: string;
  arrivedAt?: string;
  events: {
    type: string;
    at: string;
    recordedAt: string;
    reason: string;
    actorId: string;
  }[];
}
export interface TaskSpec {
  id: string;
  measureId: string;
  kind: TaskKind;
  title: string;
  outcome: string;
  ownerId: string;
  performerId: string;
  reviewerId: string;
  due: string;
  criteria: string;
  requiredEvidence: string;
  required: boolean;
  dependencies: string[];
  observationHours: number;
  notBefore?: string;
  method: string;
  contractor?: ContractorWork;
  cancelReason?: string;
  relatedTaskId?: string;
}
export interface Task extends TaskSpec {
  status: TaskStatus;
  createdAt?: string;
  originalDue?: string;
  acceptedAssignmentAt?: string;
  acceptedAt?: string;
  cancelledAt?: string;
  assignmentIntervals: Interval[];
  attempts: Attempt[];
  waits: Wait[];
  transfers: Transfer[];
  deadlineChanges: DeadlineChange[];
  planVersion?: number;
  legacyRaw?: unknown;
  notes?: { text: string; reason: string; actorId: string; at: string }[];
}
export interface Plan {
  version: number;
  baseVersion: number;
  status: "draft" | "submitted" | "approved" | "returned";
  authorId: string;
  createdAt: string;
  reason: string;
  tasks: TaskSpec[];
  technicalApproverId: string;
  decisions: {
    actorId: string;
    function: "quality" | "technical";
    at: string;
    decision: "approved" | "returned";
    reason: string;
  }[];
  approvedAt?: string;
}
export interface ExternalDecision {
  id: string;
  subject: string;
  type: string;
  responsible: string;
  required: boolean;
  state: "pending" | "recorded";
  reference?: string;
  author?: string;
  decidedAt?: string;
  recordedAt?: string;
  recordedBy?: string;
  result?: string;
  documentIds: string[];
}
export interface DocumentRecord {
  id: string;
  caseId: string;
  taskId?: string;
  decisionId?: string;
  name: string;
  type: string;
  size: number;
  source: string;
  uploadedBy: string;
  uploadedAt: string;
  occurredAt: string;
  version: number;
  previousId?: string;
}
export interface HistoryEvent {
  id: string;
  seq: number;
  caseId?: string;
  taskId?: string;
  actorId: string;
  actorRole: Role;
  action: string;
  label: string;
  reason: string;
  occurredAt: string;
  recordedAt: string;
  revision: number;
  before: unknown;
  after: unknown;
  previous: string;
  checksum: string;
}
export interface Comment {
  id: string;
  authorId: string;
  text: string;
  at?: string;
  legacyTime?: string;
}
export interface Deviation {
  id: string;
  number: string;
  revision: number;
  title: string;
  description: string;
  detectedAt?: string;
  registeredAt?: string;
  enteredAt: string;
  authorId: string;
  department: string;
  line: string;
  area: string;
  place: string;
  detector: string;
  expected: string;
  actual: string;
  immediateActions: string;
  impact: string;
  safety: string;
  amount: string;
  objects: AffectedObject[];
  stage: Stage;
  coordinatorId: string;
  leadId: string;
  originalDue?: string;
  due?: string;
  deadlineChanges: DeadlineChange[];
  assessments: Assessment[];
  assessmentDraft?: Assessment;
  investigations: Investigation[];
  investigationDraft?: Investigation;
  failedInvestigationRevision?: number;
  pendingReconsideration: boolean;
  plans: Plan[];
  activePlanVersion: number;
  noMeasures?: {
    reason: string;
    actorId: string;
    at: string;
    investigationRevision: number;
  };
  tasks: Task[];
  externalDecisions: ExternalDecision[];
  stageIntervals: Interval[];
  ownerIntervals: Interval[];
  ownerTransfers: Transfer[];
  comments: Comment[];
  closedAt?: string;
  closureReason?: string;
  relatedCaseId?: string;
  duplicateOf?: string;
  legacy?: {
    raw: Record<string, unknown>;
    status: string;
    needsClarification: boolean;
    notes: string[];
  };
  demo?: boolean;
}
export interface Notification {
  id: string;
  userId: string;
  caseId?: string;
  taskId?: string;
  title: string;
  at: string;
  readAt?: string;
}
export interface Settings {
  coordinatorId: string;
  investigatorId: string;
  line: string;
  alertHours: number;
  assignmentAlertHours: number;
}
export interface Store {
  schemaVersion: 2;
  revision: number;
  people: Person[];
  areas: Reference[];
  objects: Reference[];
  contractors: Contractor[];
  settings: Settings;
  cases: Deviation[];
  documents: DocumentRecord[];
  events: HistoryEvent[];
  notifications: Notification[];
  counters: Record<string, number>;
  migration?: {
    version: number;
    at: string;
    count: number;
    warnings: string[];
  };
  views: Record<string, unknown>;
}
export type CommandType =
  | "register"
  | "save_assessment"
  | "confirm_assessment"
  | "save_investigation"
  | "submit_investigation"
  | "resolve_investigation"
  | "add_task"
  | "save_plan"
  | "submit_plan"
  | "review_plan"
  | "accept_assignment"
  | "decline_assignment"
  | "start_task"
  | "wait_task"
  | "resume_task"
  | "submit_task"
  | "review_task"
  | "request_transfer"
  | "decide_transfer"
  | "force_transfer"
  | "replace_assignment"
  | "reschedule"
  | "contractor_permits"
  | "approve_contractor"
  | "contractor_event"
  | "replace_contractor"
  | "require_decision"
  | "record_decision"
  | "no_measures"
  | "dispose"
  | "close"
  | "comment"
  | "attach"
  | "clarify_legacy"
  | "correct_time"
  | "cancel_task"
  | "update_settings"
  | "upsert_reference"
  | "read_notification"
  | "refresh_alerts"
  | "save_view"
  | "annotate_task";
export interface Command {
  type: CommandType;
  actorId: string;
  expectedRevision: number;
  caseId?: string;
  taskId?: string;
  data?: Record<string, unknown>;
  occurredAt?: string;
}
export interface Upload {
  id: string;
  blob: Blob;
}
export interface CommandResult {
  state: Store;
  caseId?: string;
}
export const stageLabels: Record<Stage, string> = {
  assessment: "Оценка",
  investigation: "Расследование",
  plan: "План мер",
  execution: "Выполнение",
  acceptance: "Приёмка",
  effectiveness: "Эффективность",
  closure: "Закрытие",
  closed: "Закрыто",
  duplicate: "Дубль",
  out_of_scope: "Вне области",
  unknown: "Уточнить этап",
};
export const statusLabels: Record<TaskStatus, string> = {
  assigned: "Назначено",
  ready: "Принято исполнителем",
  in_progress: "Выполняется",
  waiting: "Ожидание",
  submitted: "На проверке",
  rework: "Доработка",
  accepted: "Результат принят",
  cancelled: "Отменено по решению",
  ineffective: "Эффект не подтверждён",
  legacy: "Уточнить задание",
};
export const severityLabels: Record<Severity, string> = {
  low: "Низкая",
  medium: "Средняя",
  high: "Высокая",
  critical: "Критическое",
};
export const roleLabels: Record<Role, string> = {
  employee: "Сотрудник производства",
  quality: "Качество",
  manager: "Руководитель / технический специалист",
  admin: "Администратор",
};
