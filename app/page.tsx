"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  ClipboardList,
  FileText,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import {
  Command,
  Person,
  Store,
  Upload,
  roleLabels,
} from "../lib/domain/types";
import { LocalRepository, DATABASE_NAME } from "../lib/storage/local-adapter";
import { authenticate, demoPeople, emptyStore } from "../lib/demo/people";
import { Context } from "../components/context";
import { Registry } from "../components/registry";
import { Work } from "../components/work";
import { Reports } from "../components/reports";
import { Settings } from "../components/settings";
import { Inspector } from "../components/inspector";
import { CreateForm } from "../components/create";
import { Dialog, download } from "../components/forms";
import { workQueue } from "../lib/domain/selectors";
import { dateLabel } from "../lib/domain/time";

export default function App() {
  const [state, setState] = useState<Store | null>(null);
  const current = useRef<Store | null>(null),
    repository = useRef<LocalRepository | null>(null);
  const [userId, setUserId] = useState<string | null>(null),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [now, setNow] = useState(new Date().toISOString());
  const [view, setView] = useState("work"),
    [selectedId, setSelectedId] = useState<string>(),
    [section, setSection] = useState("overview"),
    [expanded, setExpanded] = useState(false),
    [create, setCreate] = useState(false),
    [repeatId, setRepeatId] = useState<string>();
  const [sidebar, setSidebar] = useState(false),
    [notifications, setNotifications] = useState(false),
    [profile, setProfile] = useState(false),
    [dirty, setDirty] = useState(false),
    [externalChange, setExternalChange] = useState(false);
  const dirtyRef = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const install = (s: Store) => {
    current.current = s;
    setState(s);
  };
  const setFormDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  }, []);
  const toast = useCallback((s: string) => setNotice(s), []);
  const guard = (action: () => void) => {
    if (dirtyRef.current) setPending(() => action);
    else action();
  };
  const refresh = useCallback(async () => {
    if (!repository.current) return;
    const s = await repository.current.read();
    if (current.current?.revision !== s.revision) {
      if (dirtyRef.current) setExternalChange(true);
      else {
        current.current = s;
        setState(s);
      }
    }
    setNow(new Date().toISOString());
  }, []);
  useEffect(() => {
    let alive = true;
    const repo = new LocalRepository(
      DATABASE_NAME,
      window.localStorage,
      new URLSearchParams(location.search).has("empty")
        ? () => emptyStore()
        : undefined,
    );
    repository.current = repo;
    repo
      .initialize()
      .then((s) => {
        if (!alive) return;
        install(s);
        try {
          const stored = JSON.parse(
            localStorage.getItem("pharmaq-session") || "null",
          );
          const id =
            typeof stored === "string"
              ? stored
              : stored?.userId ||
                (typeof stored?.email === "string" && stored.email.length > 0
                  ? s.people.find((p) => p.email === stored.email)?.id
                  : undefined);
          if (id && s.people.some((p) => p.id === id && p.active)) {
            setUserId(id);
            localStorage.setItem(
              "pharmaq-session",
              JSON.stringify({ userId: id }),
            );
          }
        } catch {
          localStorage.removeItem("pharmaq-session");
        }
      })
      .catch((e) => alive && setLoadError(e.message));
    const channel = new BroadcastChannel(DATABASE_NAME);
    channel.onmessage = () => void refresh().catch((e) => toast(e.message));
    const visible = () => {
      if (document.visibilityState === "visible")
        void refresh().catch((e) => toast(e.message));
    };
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(visible, 60000);
    return () => {
      alive = false;
      channel.close();
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [refresh, toast]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !create && !pending) {
        if (notifications) setNotifications(false);
        else if (profile) setProfile(false);
        else if (selectedId)
          guard(() => {
            setSelectedId(undefined);
            setFormDirty(false);
          });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const run = useCallback(
    async (
      type: Command["type"],
      data: Record<string, unknown> = {},
      caseId?: string,
      taskId?: string,
      revision?: number,
      uploads: Upload[] = [],
      occurredAt?: string,
    ) => {
      if (!repository.current || !current.current || !userId)
        throw new Error("Сеанс не открыт");
      const result = await repository.current.dispatch(
        {
          type,
          data,
          actorId: userId,
          caseId,
          taskId,
          expectedRevision: revision ?? current.current.revision,
          occurredAt,
        },
        uploads,
      );
      const silent = [
        "save_view",
        "refresh_alerts",
        "read_notification",
      ].includes(type);
      if (
        silent &&
        dirtyRef.current &&
        result.state.revision !== current.current.revision
      ) {
        setExternalChange(true);
      } else install(result.state);
      setNow(new Date().toISOString());
      if (
        !["save_view", "refresh_alerts", "read_notification"].includes(type)
      ) {
        setFormDirty(false);
        setExternalChange(false);
        toast(result.state.events.at(-1)?.label || "Сохранено");
      }
      return result;
    },
    [userId, setFormDirty, toast],
  );
  useEffect(() => {
    if (!userId || !state) return;
    void run("refresh_alerts").catch((e) => toast(e.message));
  }, [userId, now.slice(0, 16)]);
  const open = (id: string, target = "overview") =>
    guard(() => {
      const task = target.startsWith("task:")
        ? current.current?.cases
            .find((c) => c.id === id)
            ?.tasks.find((t) => t.id === target.slice(5))
        : undefined;
      if (task && ["assessment", "investigation"].includes(task.kind))
        target = task.kind;
      setSelectedId(id);
      setSection(target);
      setExpanded(target !== "overview");
      setFormDirty(false);
      setSidebar(false);
    });
  const navigate = (v: string) =>
    guard(() => {
      setView(v);
      setSelectedId(undefined);
      setSidebar(false);
      setFormDirty(false);
    });
  const changeSection = (s: string) =>
    guard(() => {
      setSection(s);
      if (!["overview", "documents", "history"].includes(s)) setExpanded(true);
      setFormDirty(false);
    });
  const logout = () =>
    guard(() => {
      localStorage.removeItem("pharmaq-session");
      setUserId(null);
      setSelectedId(undefined);
      setProfile(false);
      setFormDirty(false);
    });
  if (loadError)
    return (
      <main className="load-state">
        <Logo />
        <h1>Данные не открыты</h1>
        <p className="error" role="alert">
          {loadError}
        </p>
        <p>
          Исходные данные не заменены демонстрационным набором. Сохраните
          исходный файл для восстановления.
        </p>
        <label className="field">
          Восстановить исправленный файл прежних записей (.json)
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !repository.current) return;
              try {
                await repository.current.restoreLegacy(file);
                location.reload();
              } catch (error) {
                setLoadError(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          />
        </label>
        <button
          onClick={() =>
            download(
              new Blob([localStorage.getItem("pharmaq-deviations") || ""], {
                type: "application/json",
              }),
              "pharmaq-legacy-recovery.json",
            )
          }
        >
          Скачать исходные данные
        </button>
        <button onClick={() => location.reload()}>Повторить открытие</button>
      </main>
    );
  if (!state || !repository.current)
    return (
      <main className="load-state">
        <Logo />
        <p role="status">Открытие локального хранилища…</p>
      </main>
    );
  const user = state.people.find((p) => p.id === userId && p.active);
  if (!user)
    return (
      <Login
        state={state}
        login={(p) => {
          localStorage.setItem(
            "pharmaq-session",
            JSON.stringify({ userId: p.id }),
          );
          setUserId(p.id);
          setView("work");
        }}
      />
    );
  const selected = state.cases.find((c) => c.id === selectedId),
    queue = workQueue(state, user);
  const unread = state.notifications.filter(
      (n) => n.userId === user.id && !n.readAt,
    ),
    mine = state.notifications.filter((n) => n.userId === user.id);
  return (
    <Context.Provider
      value={{
        state,
        user,
        now,
        repository: repository.current,
        run,
        open,
        toast,
        confirmNavigation: guard,
      }}
    >
      <div className="app-shell">
        <header className="topbar">
          <button
            className="icon mobile-nav"
            aria-label="Открыть навигацию"
            onClick={() => setSidebar(!sidebar)}
          >
            <Menu size={20} />
          </button>
          <Logo />
          <div className="line-context">{state.settings.line}</div>
          <div className="topbar-right">
            <button
              className="icon bell"
              aria-label={`Уведомления: ${unread.length} непрочитанных`}
              onClick={() => {
                setNotifications(!notifications);
                setProfile(false);
              }}
            >
              <Bell size={19} />
              {unread.length > 0 && <span>{unread.length}</span>}
            </button>
            <button
              className="avatar"
              aria-label="Профиль пользователя"
              onClick={() => {
                setProfile(!profile);
                setNotifications(false);
              }}
            >
              {user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </button>
          </div>
          {profile && (
            <div className="profile-popover">
              <b>{user.name}</b>
              <small>{roleLabels[user.role]}</small>
              <button
                onClick={() => {
                  navigate("settings");
                  setProfile(false);
                }}
              >
                Профиль и настройки
              </button>
              <button onClick={logout}>
                <LogOut size={16} /> Выйти
              </button>
            </div>
          )}
          {notifications && (
            <div className="notifications-popover">
              <div className="row-between">
                <h3>Уведомления</h3>
                <button
                  className="icon"
                  aria-label="Закрыть уведомления"
                  onClick={() => setNotifications(false)}
                >
                  <X size={18} />
                </button>
              </div>
              {mine.length ? (
                [...mine].reverse().map((n) => (
                  <button
                    className={n.readAt ? "" : "unread"}
                    key={n.id}
                    onClick={async () => {
                      try {
                        await run("read_notification", { id: n.id });
                        setNotifications(false);
                        if (n.caseId)
                          open(
                            n.caseId,
                            n.taskId ? `task:${n.taskId}` : "overview",
                          );
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }}
                  >
                    <b>{n.title}</b>
                    <small>
                      {dateLabel(n.at, true)} ·{" "}
                      {n.readAt ? "Прочитано" : "Новое"}
                    </small>
                  </button>
                ))
              ) : (
                <p className="muted">Уведомлений пока нет</p>
              )}
            </div>
          )}
        </header>
        <aside className={`sidebar ${sidebar ? "open" : ""}`}>
          <nav>
            {[
              ["work", "Моя работа", ClipboardList],
              ["deviations", "Отклонения", FileText],
              ["reports", "Отчёты", BarChart3],
            ].map(([id, title, Icon]) => {
              const I = Icon as typeof FileText;
              return (
                <button
                  key={String(id)}
                  className={view === id ? "active" : ""}
                  onClick={() => navigate(String(id))}
                >
                  <I size={20} />
                  <span>{String(title)}</span>
                  {id === "work" && queue.length > 0 && (
                    <span className="count">{queue.length}</span>
                  )}
                </button>
              );
            })}
          </nav>
          <button
            className={`settings-nav ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={20} /> Настройки
          </button>
        </aside>
        <main
          className={`main-workspace ${selected ? "with-inspector" : ""} ${selected && expanded ? "inspector-expanded" : ""}`}
        >
          <div className="workspace-content">
            {view === "work" ? (
              <Work
                onCreate={() =>
                  guard(() => {
                    setRepeatId(undefined);
                    setCreate(true);
                  })
                }
              />
            ) : view === "deviations" ? (
              <Registry
                selectedId={selectedId}
                onCreate={() =>
                  guard(() => {
                    setRepeatId(undefined);
                    setCreate(true);
                  })
                }
              />
            ) : view === "reports" ? (
              <Reports />
            ) : (
              <Settings onDirty={setFormDirty} />
            )}
          </div>
          {selected && (
            <Inspector
              item={selected}
              section={section}
              expanded={expanded}
              onSection={changeSection}
              onExpand={() => setExpanded(!expanded)}
              onClose={() =>
                guard(() => {
                  setSelectedId(undefined);
                  setFormDirty(false);
                })
              }
              onDirty={setFormDirty}
              onRepeat={() =>
                guard(() => {
                  setRepeatId(selected.id);
                  setCreate(true);
                })
              }
            />
          )}
        </main>
        {notice && (
          <div className="toast" role="status">
            <span>{notice}</span>
            <button
              className="icon"
              aria-label="Скрыть сообщение"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {externalChange && (
          <div className="conflict-banner" role="alert">
            Данные изменились в другой вкладке. Ваш ввод сохранён в форме;
            устаревшее сохранение будет отклонено.
            <button
              onClick={() =>
                guard(() => {
                  setFormDirty(false);
                  setExternalChange(false);
                  void refresh();
                })
              }
            >
              Загрузить свежие данные
            </button>
          </div>
        )}
        {create && (
          <Dialog
            title="Новое отклонение"
            wide
            onClose={() =>
              guard(() => {
                setCreate(false);
                setFormDirty(false);
              })
            }
          >
            <CreateForm
              relatedCaseId={repeatId}
              onDirty={setFormDirty}
              onDone={() => {
                setCreate(false);
                setFormDirty(false);
                setView("deviations");
              }}
            />
          </Dialog>
        )}
        {pending && (
          <Dialog
            title="В форме есть несохранённый ввод"
            onClose={() => setPending(null)}
          >
            <p>Вернуться к редактированию или продолжить без сохранения?</p>
            <div className="button-row">
              <button className="primary" onClick={() => setPending(null)}>
                Продолжить редактирование
              </button>
              <button
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  setFormDirty(false);
                  action();
                }}
              >
                Продолжить без сохранения
              </button>
            </div>
          </Dialog>
        )}
        <span className="sr-only" aria-live="polite">
          {dirty ? "В форме есть несохранённые изменения" : ""}
        </span>
      </div>
    </Context.Provider>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark" aria-hidden="true" />
      <b>PharmaQ</b>
    </div>
  );
}
function Login({ state, login }: { state: Store; login: (p: Person) => void }) {
  const [email, setEmail] = useState("quality@pharmaq.demo"),
    [password, setPassword] = useState("Demo123!"),
    [error, setError] = useState("");
  return (
    <main className="login-page">
      <section className="login-box">
        <Logo />
        <h1>Вход в PharmaQ</h1>
        <p className="muted">Локальная демонстрационная версия</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const p = authenticate(state, email, password);
            if (!p) {
              setError("Неверный email или пароль, либо участник неактивен");
              return;
            }
            login(p);
          }}
        >
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" type="submit">
            Войти
          </button>
        </form>
        <details open>
          <summary>Демонстрационные аккаунты</summary>
          <div className="demo-accounts">
            {demoPeople.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setEmail(p.email!);
                  setPassword("Demo123!");
                  setError("");
                }}
              >
                <b>{p.name}</b>
                <small>{roleLabels[p.role]}</small>
              </button>
            ))}
          </div>
          <small>Общий пароль: Demo123!</small>
        </details>
        <p className="hint">
          Роли проверяют логику демо. Данные хранятся локально в браузере.
        </p>
      </section>
    </main>
  );
}
