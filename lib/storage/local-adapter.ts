import { Command, CommandResult, Store, Upload } from "../domain/types";
import { execute } from "../domain/commands";
import { requireRule } from "../domain/permissions";
import { migrateLegacy } from "./migrations";
import { makeDemo } from "../demo/seed";
import { Repository } from "./repository";

export const DATABASE_NAME = "pharmaq-local-v2";
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        tx.error || new Error("Изменения не сохранены: транзакция отменена"),
      );
    tx.onerror = () =>
      reject(tx.error || new Error("Ошибка локального хранилища"));
  });
}
function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 2);
    req.onupgradeneeded = () => {
      for (const name of ["state", "files", "backups"])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error("Закройте другие вкладки PharmaQ и повторите открытие"));
  });
}
export class LocalRepository implements Repository {
  private db?: Promise<IDBDatabase>;
  constructor(
    private name = DATABASE_NAME,
    private legacy?: Storage,
    private seed = makeDemo,
    private clock = () => new Date().toISOString(),
  ) {}
  private database() {
    return (this.db ||= openDatabase(this.name));
  }
  async initialize() {
    const db = await this.database();
    const tx = db.transaction(["state", "backups"], "readwrite");
    const done = complete(tx);
    const table = tx.objectStore("state");
    const existing = (await request(table.get("root"))) as Store | undefined;
    if (existing) {
      await done;
      requireRule(
        existing.schemaVersion === 2,
        "Версия данных не поддерживается. Сохраните резервную копию",
      );
      return existing;
    }
    try {
      const raw = this.legacy?.getItem("pharmaq-deviations");
      const state =
        raw !== null && raw !== undefined
          ? migrateLegacy(raw, this.clock())
          : this.seed(this.clock());
      if (raw !== null && raw !== undefined)
        tx.objectStore("backups").put({ raw, at: this.clock() }, "legacy-v1");
      table.put(state, "root");
      await done;
      return state;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw new Error(
        `Не удалось открыть прежние данные. Они сохранены без изменений. ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  async read() {
    const db = await this.database();
    const tx = db.transaction("state", "readonly");
    const done = complete(tx);
    const state = (await request(tx.objectStore("state").get("root"))) as Store;
    await done;
    requireRule(state, "Хранилище ещё не открыто");
    return state;
  }
  async dispatch(
    command: Command,
    uploads: Upload[] = [],
  ): Promise<CommandResult> {
    const db = await this.database();
    const tx = db.transaction(["state", "files"], "readwrite");
    const done = complete(tx);
    try {
      const state = (await request(
        tx.objectStore("state").get("root"),
      )) as Store;
      const result = execute(state, command, this.clock());
      const docs = result.state.documents.filter(
        (d) => !state.documents.some((x) => x.id === d.id),
      );
      requireRule(
        docs.length === uploads.length &&
          docs.every((d) =>
            uploads.some((u) => u.id === d.id && u.blob.size === d.size),
          ),
        "Содержимое вложения отсутствует или не соответствует метаданным",
      );
      for (const upload of uploads)
        tx.objectStore("files").put(upload.blob, upload.id);
      tx.objectStore("state").put(result.state, "root");
      await done;
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel(this.name);
        channel.postMessage({ revision: result.state.revision });
        channel.close();
      }
      return result;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw e;
    }
  }
  async file(id: string) {
    const db = await this.database();
    const tx = db.transaction("files", "readonly");
    const done = complete(tx);
    const blob = (await request(tx.objectStore("files").get(id))) as
      Blob | undefined;
    await done;
    requireRule(blob, "Содержимое файла не найдено");
    return blob;
  }
  async exportBackup() {
    const db = await this.database();
    const tx = db.transaction(["state", "files", "backups"], "readonly");
    const done = complete(tx);
    const [state, blobs, keys, legacy] = await Promise.all([
      request(tx.objectStore("state").get("root")),
      request(tx.objectStore("files").getAll()),
      request(tx.objectStore("files").getAllKeys()),
      request(tx.objectStore("backups").get("legacy-v1")),
    ]);
    await done;
    const files = await Promise.all(
      (blobs as Blob[]).map(async (blob, i) => ({
        id: keys[i],
        type: blob.type,
        data: Array.from(new Uint8Array(await blob.arrayBuffer())),
      })),
    );
    return new Blob(
      [JSON.stringify({ format: "pharmaq-backup-2", state, files, legacy })],
      { type: "application/json" },
    );
  }
  async restoreBackup(file: Blob, expectedRevision: number) {
    const backup = JSON.parse(await file.text());
    requireRule(
      backup.format === "pharmaq-backup-2" &&
        backup.state?.schemaVersion === 2 &&
        Array.isArray(backup.files) &&
        Array.isArray(backup.state.cases),
      "Неподдерживаемый формат резервной копии",
    );
    const incoming = backup.state as Store;
    requireRule(
      incoming.documents.every((d) =>
        backup.files.some(
          (f: { id: string; data: number[] }) =>
            f.id === d.id && f.data.length === d.size,
        ),
      ),
      "Резервная копия неполна: отсутствуют файлы",
    );
    const db = await this.database();
    const tx = db.transaction(["state", "files", "backups"], "readwrite");
    const done = complete(tx);
    try {
      const current = (await request(
        tx.objectStore("state").get("root"),
      )) as Store;
      requireRule(
        current.revision === expectedRevision,
        "Данные изменились; обновите страницу",
      );
      requireRule(
        current.cases.length === 0,
        "Восстановление доступно только в пустое хранилище. Используйте отдельный адрес или профиль браузера, чтобы сохранить существующие дела",
      );
      incoming.revision = current.revision + 1;
      tx.objectStore("state").put(incoming, "root");
      for (const f of backup.files)
        tx.objectStore("files").put(
          new Blob([new Uint8Array(f.data)], { type: f.type }),
          f.id,
        );
      if (backup.legacy)
        tx.objectStore("backups").put(backup.legacy, "legacy-v1");
      await done;
      return incoming;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw e;
    }
  }
  async restoreLegacy(file: Blob) {
    const raw = await file.text();
    const incoming = migrateLegacy(raw, this.clock());
    const db = await this.database();
    const tx = db.transaction(["state", "backups"], "readwrite");
    const done = complete(tx);
    try {
      const current = (await request(tx.objectStore("state").get("root"))) as
        Store | undefined;
      requireRule(
        !current || current.cases.length === 0,
        "Импорт прежних данных доступен только в пустое хранилище",
      );
      incoming.revision = (current?.revision || 0) + 1;
      tx.objectStore("backups").put(
        {
          raw,
          originalRaw: this.legacy?.getItem("pharmaq-deviations"),
          at: this.clock(),
        },
        "legacy-v1",
      );
      tx.objectStore("state").put(incoming, "root");
      await done;
      return incoming;
    } catch (e) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw e;
    }
  }
}
