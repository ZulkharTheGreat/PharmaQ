"use client";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { useApp } from "./context";
import { Field, Form, PeopleSelect, value, download } from "./forms";
import { roleLabels } from "../lib/domain/types";
export function Settings({ onDirty }: { onDirty: (v: boolean) => void }) {
  const { state, user, repository, run, toast, confirmNavigation } = useApp();
  const [kind, setKind] = useState("people");
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [backup, setBackup] = useState<File | null>(null);
  const list =
    kind === "people"
      ? state.people
      : kind === "areas"
        ? state.areas
        : kind === "objects"
          ? state.objects
          : state.contractors;
  return (
    <section className="workspace-section settings-page">
      <div className="page-heading">
        <h1>Настройки</h1>
      </div>
      <section className="settings-section">
        <h2>Профиль</h2>
        <dl className="metadata">
          <dt>Участник</dt>
          <dd>{user.name}</dd>
          <dt>Функция</dt>
          <dd>{roleLabels[user.role]}</dd>
          <dt>Email</dt>
          <dd>{user.email || "Не указан"}</dd>
        </dl>
        <p className="hint">
          Локальное демо. Данные и файлы находятся в этом браузере на этом
          адресе.
        </p>
        <button
          onClick={async () => {
            try {
              download(
                await repository.exportBackup(),
                `pharmaq-backup-${new Date().toISOString().slice(0, 10)}.json`,
              );
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          <Download size={16} /> Выгрузить данные и файлы
        </button>
        {state.migration && (
          <p className="hint">
            Перенесено прежних записей: {state.migration.count}. Исходный ключ
            localStorage и резервная копия сохранены.
          </p>
        )}
      </section>
      {user.role === "admin" ? (
        <>
          <section className="settings-section">
            <h2>Маршрутизация и сигналы демо</h2>
            <Form
              onDirty={onDirty}
              key={`settings-${state.revision}`}
              label="Сохранить настройки"
              submit={async (f) => {
                await run("update_settings", {
                  coordinatorId: value(f, "coordinatorId"),
                  investigatorId: value(f, "investigatorId"),
                  line: value(f, "line"),
                  alertHours: Number(value(f, "alertHours")),
                  assignmentAlertHours: Number(
                    value(f, "assignmentAlertHours"),
                  ),
                });
              }}
            >
              <div className="form-grid">
                <Field label="Название линии">
                  <input
                    name="line"
                    defaultValue={state.settings.line}
                    required
                  />
                </Field>
                <Field label="Координатор новых дел">
                  <PeopleSelect
                    name="coordinatorId"
                    quality
                    value={state.settings.coordinatorId}
                  />
                </Field>
                <Field label="Руководитель расследования">
                  <PeopleSelect
                    name="investigatorId"
                    manager
                    value={state.settings.investigatorId}
                  />
                </Field>
                <Field label="Напомнить до срока, часов">
                  <input
                    name="alertHours"
                    type="number"
                    min="0"
                    defaultValue={state.settings.alertHours}
                    required
                  />
                </Field>
                <Field label="Сигнал о непринятом назначении, часов">
                  <input
                    name="assignmentAlertHours"
                    type="number"
                    min="1"
                    defaultValue={state.settings.assignmentAlertHours}
                    required
                  />
                </Field>
              </div>
            </Form>
          </section>
          <section className="settings-section">
            <div className="row-between">
              <h2>Справочники</h2>
              <button
                onClick={() =>
                  confirmNavigation(() => {
                    setEdit({});
                    onDirty(false);
                  })
                }
              >
                <Plus size={16} /> Добавить
              </button>
            </div>
            <div className="view-tabs">
              {[
                ["people", "Участники"],
                ["areas", "Участки"],
                ["objects", "Объекты"],
                ["contractors", "Подрядчики"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={kind === k ? "active" : ""}
                  onClick={() =>
                    confirmNavigation(() => {
                      setKind(k);
                      setEdit(null);
                      onDirty(false);
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {edit ? (
              <Form
                onDirty={onDirty}
                key={`${kind}-${edit.id || "new"}`}
                label="Сохранить запись"
                submit={async (f) => {
                  const record: Record<string, unknown> = {
                    id: edit.id,
                    name: value(f, "name"),
                    active: value(f, "active") === "yes",
                  };
                  if (kind === "people") {
                    record.role = value(f, "role");
                    record.email = value(f, "email");
                    record.department = value(f, "department");
                  }
                  if (kind === "contractors") {
                    record.specialty = value(f, "specialty");
                    record.contact = value(f, "contact");
                  }
                  await run("upsert_reference", { kind, value: record });
                  setEdit(null);
                }}
                footer={
                  <button
                    type="button"
                    onClick={() =>
                      confirmNavigation(() => {
                        setEdit(null);
                        onDirty(false);
                      })
                    }
                  >
                    Отмена
                  </button>
                }
              >
                <div className="form-grid">
                  <Field label="Имя / название *">
                    <input
                      name="name"
                      required
                      defaultValue={String(edit.name || "")}
                    />
                  </Field>
                  <Field label="Состояние">
                    <select
                      name="active"
                      defaultValue={edit.active === false ? "no" : "yes"}
                    >
                      <option value="yes">Действует</option>
                      <option value="no">Неактивно</option>
                    </select>
                  </Field>
                  {kind === "people" && (
                    <>
                      <Field label="Демонстрационная роль">
                        <select
                          name="role"
                          defaultValue={String(edit.role || "employee")}
                        >
                          {Object.entries(roleLabels).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Email демовхода">
                        <input
                          name="email"
                          type="email"
                          defaultValue={String(edit.email || "")}
                        />
                      </Field>
                      <Field label="Подразделение">
                        <input
                          name="department"
                          defaultValue={String(edit.department || "")}
                        />
                      </Field>
                      <p className="hint wide">
                        Общий пароль локального демовхода: Demo123!.
                      </p>
                    </>
                  )}
                  {kind === "contractors" && (
                    <>
                      <Field label="Специализация">
                        <input
                          name="specialty"
                          defaultValue={String(edit.specialty || "")}
                        />
                      </Field>
                      <Field label="Контакт">
                        <input
                          name="contact"
                          defaultValue={String(edit.contact || "")}
                        />
                      </Field>
                    </>
                  )}
                </div>
              </Form>
            ) : (
              <div className="reference-list">
                {list.map((x) => (
                  <button
                    key={x.id}
                    onClick={() =>
                      confirmNavigation(() => {
                        setEdit({ ...x });
                        onDirty(false);
                      })
                    }
                  >
                    <span>{x.name}</span>
                    <small>{x.active ? "Действует" : "Неактивно"}</small>
                  </button>
                ))}
              </div>
            )}
            <p className="hint">
              Деактивация сохраняет связи со старыми делами. Полномочия и
              участники здесь демонстрационные.
            </p>
          </section>
          <details className="settings-section">
            <summary>Восстановить резервную копию в пустую базу</summary>
            <p className="hint">
              Восстановление не перезаписывает существующие дела. Для переноса
              используйте пустой профиль / адрес браузера.
            </p>
            <Form
              label="Восстановить копию"
              submit={async () => {
                if (!backup) throw new Error("Выберите файл резервной копии");
                await repository.restoreBackup(backup, state.revision);
                onDirty(false);
                window.location.reload();
              }}
            >
              <Field label="Файл резервной копии">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setBackup(e.target.files?.[0] || null)}
                />
              </Field>
            </Form>
            <Form
              label="Импортировать прежние записи"
              submit={async () => {
                if (!backup)
                  throw new Error("Выберите JSON с массивом прежних записей");
                await repository.restoreLegacy(backup);
                onDirty(false);
                window.location.reload();
              }}
            >
              <p className="hint">
                Для файла прежнего приложения выберите его выше и используйте
                импорт. Исходные ключи сохраняются.
              </p>
            </Form>
          </details>
        </>
      ) : (
        <p className="hint">
          Справочники и параметры маршрутизации изменяет администратор.
        </p>
      )}
    </section>
  );
}
