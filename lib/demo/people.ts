import { Person, Store } from "../domain/types";
export const demoPeople: Person[] = [
  {
    id: "employee",
    name: "Айдана Садыкова",
    email: "employee@pharmaq.demo",
    role: "employee",
    department: "Производство",
    active: true,
  },
  {
    id: "quality",
    name: "Елена Ким",
    email: "quality@pharmaq.demo",
    role: "quality",
    department: "Отдел качества",
    active: true,
  },
  {
    id: "manager",
    name: "Руслан Омаров",
    email: "manager@pharmaq.demo",
    role: "manager",
    department: "Производство",
    active: true,
  },
  {
    id: "admin",
    name: "Данияр Ахметов",
    email: "admin@pharmaq.demo",
    role: "admin",
    department: "ИТ",
    active: true,
  },
];
export function emptyStore(): Store {
  return {
    schemaVersion: 2,
    revision: 0,
    people: structuredClone(demoPeople),
    areas: [
      "TAB-01",
      "TAB-02",
      "PKG-03",
      "WH-01",
      "WH-02",
      "QC-LAB",
      "BLI-04",
      "HVAC-07",
    ].map((name) => ({ id: name, name, active: true })),
    objects: [
      "Амоксициллин 500 мг",
      "Парацетамол 500 мг",
      "Лактоза моногидрат",
    ].map((name, i) => ({ id: `object-${i}`, name, active: true })),
    contractors: [
      {
        id: "vendor-1",
        name: "ТехСервис",
        specialty: "Обслуживание оборудования",
        contact: "",
        active: true,
      },
    ],
    settings: {
      coordinatorId: "quality",
      investigatorId: "manager",
      line: "Линия 01",
      alertHours: 24,
      assignmentAlertHours: 24,
    },
    cases: [],
    documents: [],
    events: [],
    notifications: [],
    counters: {},
    views: {},
  };
}
export function authenticate(s: Store, email: string, password: string) {
  return password === "Demo123!"
    ? s.people.find(
        (p) =>
          p.active && p.email?.toLowerCase() === email.trim().toLowerCase(),
      )
    : undefined;
}
