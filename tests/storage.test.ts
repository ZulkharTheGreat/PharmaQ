import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import test from "node:test";
import assert from "node:assert/strict";
import { LocalRepository } from "../lib/storage/local-adapter";
import { emptyStore } from "../lib/demo/people";
import { migrateLegacy } from "../lib/storage/migrations";
import { legacyDate } from "../lib/domain/time";
import { validateFile } from "../lib/domain/commands";
const now = "2026-10-27T08:00:00.000Z";
const legacy = JSON.stringify([
  {
    id: 7,
    number: "DEV-2026-0012",
    title: "Прежняя запись",
    date: "21.10.2026",
    due: "29.10.2026",
    owner: "Марат Алиев",
    status: "Просрочено",
    product: "Сырьё",
    batch: "RM-7",
    comments: [
      {
        author: "Автор без логина",
        text: "Сохранить комментарий",
        time: "Сегодня, 09:42",
      },
    ],
    capa: [
      {
        title: "Старая мера",
        owner: "Другой человек",
        due: "30.10.2026",
        status: "Выполняется",
        type: "Корректирующее",
      },
    ],
    customField: { preserve: true },
  },
]);
function storage(raw: string | null): Storage {
  const values = new Map<string, string>(
    raw === null ? [] : [["pharmaq-deviations", raw]],
  );
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
    clear: () => values.clear(),
    key: (i) => Array.from(values.keys())[i] || null,
    get length() {
      return values.size;
    },
  };
}
function repo(raw: string | null = null, name = crypto.randomUUID()) {
  return new LocalRepository(
    name,
    storage(raw),
    () => emptyStore(),
    () => now,
  );
}
const registration = {
  title: "Файл и данные",
  description: "Полное описание",
  detectedAt: now,
  department: "Цех",
  line: "TAB-01",
};
test("S01: legacy сохраняет номера, неизвестный этап, людей, комментарии, меры и произвольные поля", () => {
  const s = migrateLegacy(legacy, now);
  const c = s.cases[0];
  assert.equal(c.number, "DEV-2026-0012");
  assert.equal(c.stage, "unknown");
  assert.equal(c.stageIntervals.length, 0);
  assert.equal(c.registeredAt, undefined);
  assert.equal(c.comments[0].at, undefined);
  assert.equal(c.comments[0].text, "Сохранить комментарий");
  assert.equal(c.tasks[0].status, "legacy");
  assert.deepEqual(c.legacy!.raw.customField, { preserve: true });
  assert.equal(
    s.people.find((p) => p.id === c.coordinatorId)!.name,
    "Марат Алиев",
  );
  assert.equal(migrateLegacy(legacy, now, s).cases.length, 1);
});
test("S02: старое закрытое дело не получает фиктивных оснований", () => {
  const s = migrateLegacy(
    JSON.stringify([
      { id: 1, number: "DEV-1", title: "Архив", status: "Закрыто" },
    ]),
    now,
  );
  assert.equal(s.cases[0].stage, "closed");
  assert.equal(s.cases[0].closedAt, undefined);
  assert.equal(s.events.length, 0);
});
test("S03: DD.MM.YYYY разбирается явно, невозможная дата не принимается", () => {
  assert.equal(legacyDate("31.02.2026"), undefined);
  assert.equal(legacyDate("27.10.2026"), "2026-10-27T00:00:00.000Z");
  assert.equal(legacyDate("Сегодня"), undefined);
});
test("S04: повторное открытие не дублирует миграцию и оставляет исходный ключ", async () => {
  const name = crypto.randomUUID(),
    old = storage(legacy);
  const a = new LocalRepository(
    name,
    old,
    () => emptyStore(),
    () => now,
  );
  const s = await a.initialize();
  const b = new LocalRepository(
    name,
    old,
    () => emptyStore(),
    () => now,
  );
  assert.deepEqual(await b.initialize(), s);
  assert.equal(old.getItem("pharmaq-deviations"), legacy);
  const backup = JSON.parse(await (await a.exportBackup()).text());
  assert.equal(backup.legacy.raw, legacy);
});
test("S05: содержимое Blob и все метаданные переживают перезагрузку адаптера", async () => {
  const name = crypto.randomUUID(),
    a = repo(null, name);
  const initial = await a.initialize();
  const blob = new Blob(['Точное содержимое\n"файла"'], { type: "text/plain" });
  const r = await a.dispatch(
    {
      type: "register",
      actorId: "employee",
      expectedRevision: initial.revision,
      data: {
        ...registration,
        documents: [
          {
            id: "file1",
            name: "evidence.txt",
            size: blob.size,
            type: blob.type,
            source: "Внешний автор",
            occurredAt: now,
          },
        ],
      },
    },
    [{ id: "file1", blob }],
  );
  const b = repo(null, name);
  const reloaded = await b.initialize();
  assert.equal(reloaded.cases[0].description, "Полное описание");
  assert.equal(reloaded.documents[0].source, "Внешний автор");
  assert.equal(reloaded.documents[0].uploadedBy, "employee");
  assert.equal(await (await b.file("file1")).text(), await blob.text());
  assert.equal(r.caseId, reloaded.documents[0].caseId);
});
test("S06: повреждённая миграция не заменяется seed и не коммитится", async () => {
  const a = repo("{broken");
  await assert.rejects(a.initialize(), /прежние данные/);
  await assert.rejects(a.read(), /ещё не открыто/);
});
test("S07: две вкладки: одна запись проходит, устаревшая отклоняется", async () => {
  const name = crypto.randomUUID(),
    a = repo(null, name),
    b = repo(null, name);
  const initial = await a.initialize();
  await b.initialize();
  const results = await Promise.allSettled([
    a.dispatch({
      type: "register",
      actorId: "employee",
      expectedRevision: initial.revision,
      data: registration,
    }),
    b.dispatch({
      type: "register",
      actorId: "employee",
      expectedRevision: initial.revision,
      data: registration,
    }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await a.read()).cases.length, 1);
});
test("S08: ошибка записи файла откатывает дело, историю и файл", async () => {
  const a = repo();
  const s = await a.initialize();
  const blob = new Blob(["evidence"], { type: "text/plain" });
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (
    ...args: Parameters<typeof original>
  ) {
    if (this.name === "files")
      throw new DOMException("Simulated quota", "QuotaExceededError");
    return original.apply(this, args);
  };
  try {
    await assert.rejects(
      a.dispatch(
        {
          type: "register",
          actorId: "employee",
          expectedRevision: s.revision,
          data: {
            ...registration,
            documents: [
              {
                id: "f",
                name: "a.txt",
                size: blob.size,
                type: blob.type,
                source: "Автор",
                occurredAt: now,
              },
            ],
          },
        },
        [{ id: "f", blob }],
      ),
      /quota/,
    );
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.deepEqual(await a.read(), s);
  await assert.rejects(a.file("f"));
});
test("S09: метаданные без содержимого файла не сохраняются", async () => {
  const a = repo(),
    s = await a.initialize();
  await assert.rejects(
    a.dispatch({
      type: "register",
      actorId: "employee",
      expectedRevision: s.revision,
      data: {
        ...registration,
        documents: [
          {
            id: "f",
            name: "a.txt",
            size: 3,
            type: "text/plain",
            source: "Автор",
            occurredAt: now,
          },
        ],
      },
    }),
    /Содержимое/,
  );
  assert.equal((await a.read()).cases.length, 0);
});
test("S10: резервная копия переносит данные и Blob, существующая база не затирается", async () => {
  const a = repo(),
    initial = await a.initialize();
  const blob = new Blob(["backup content"], { type: "text/plain" });
  await a.dispatch(
    {
      type: "register",
      actorId: "employee",
      expectedRevision: initial.revision,
      data: {
        ...registration,
        documents: [
          {
            id: "f",
            name: "a.txt",
            size: blob.size,
            type: blob.type,
            source: "Автор",
            occurredAt: now,
          },
        ],
      },
    },
    [{ id: "f", blob }],
  );
  const backup = await a.exportBackup();
  const b = repo(),
    empty = await b.initialize();
  await b.restoreBackup(backup, empty.revision);
  assert.equal(await (await b.file("f")).text(), "backup content");
  await assert.rejects(
    b.restoreBackup(backup, (await b.read()).revision),
    /пустое хранилище/,
  );
});
test("S11: номер после миграции использует устойчивый следующий счётчик", async () => {
  const a = repo(legacy),
    initial = await a.initialize();
  const r = await a.dispatch({
    type: "register",
    actorId: "employee",
    expectedRevision: initial.revision,
    data: registration,
  });
  assert.equal(r.state.cases[0].number, "DEV-2026-0013");
});
test("S12: реально проверяется нулевой размер и неподдерживаемый MIME", () => {
  assert.throws(() =>
    validateFile({ name: "empty.txt", size: 0, type: "text/plain" }),
  );
  assert.throws(() =>
    validateFile({ name: "fake.pdf", size: 30, type: "text/html" }),
  );
});
test("S13: восстановление повреждённой миграции сохраняет оригинал, рабочая база не затирается", async () => {
  const original = storage("{broken");
  const r = new LocalRepository(
    crypto.randomUUID(),
    original,
    () => emptyStore(),
    () => now,
  );
  await assert.rejects(r.initialize());
  const restored = await r.restoreLegacy(new Blob([legacy]));
  assert.equal(restored.cases.length, 1);
  assert.equal(original.getItem("pharmaq-deviations"), "{broken");
  const backup = JSON.parse(await (await r.exportBackup()).text());
  assert.equal(backup.legacy.originalRaw, "{broken");
  assert.equal(backup.legacy.raw, legacy);
  await assert.rejects(r.restoreLegacy(new Blob(["[]"])), /пустое/);
  assert.equal((await r.read()).cases.length, 1);
});
