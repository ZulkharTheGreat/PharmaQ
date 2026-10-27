import { test, expect, Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { makeDemo } from "../../lib/demo/seed";
import { Harness } from "../harness";
import { localInput } from "../../lib/domain/time";

test("B10: создание и оценка на 390 px, длинное название и файл, доступность действий", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?empty=1");
  await login(page, "employee");
  await page.getByRole("button", { name: "Отклонение", exact: true }).click();
  const title =
    "Несоответствие маркировки нескольких партий материалов на производственной линии — контроль сохранения длинного названия и доступности формы на узком экране";
  await expect(page.getByLabel("Что произошло *")).toBeFocused();
  await page.getByLabel("Что произошло *").fill(title);
  await page.getByLabel("Участок / линия *").fill("TAB-01");
  await page
    .getByLabel("Описание фактов *")
    .fill("Факты сохранены с мобильной ширины");
  await page
    .locator("dialog summary")
    .filter({ hasText: /^Вложения/ })
    .click();
  const filename =
    "Подтверждение_результатов_контроля_маркировки_партии_материалов_с_длинным_названием_документа.txt";
  await page
    .getByLabel("Файлы", { exact: true })
    .setInputFiles({
      name: filename,
      mimeType: "text/plain",
      buffer: Buffer.from("mobile proof"),
    });
  await screenshot(page, "06-mobile-create");
  await page
    .getByRole("button", { name: "Зарегистрировать отклонение", exact: true })
    .click();
  await page.getByRole("button", { name: "Документы 1", exact: true }).click();
  await page
    .getByRole("button", { name: `Скачать ${filename}` })
    .scrollIntoViewIfNeeded();
  const bounds = await page
    .getByRole("button", { name: `Скачать ${filename}` })
    .boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await screenshot(page, "07-mobile-document");
  await role(page, "quality");
  await page.getByRole("button", { name: "Открыть навигацию" }).click();
  await openCase(page, title);
  await section(page, "Оценка");
  await page
    .getByLabel("Основание критичности", { exact: true })
    .fill("Проверка качества на узком экране");
  await page
    .getByLabel("Объём расследования", { exact: true })
    .fill("Проверить маркировку и записи");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  expect((await state(page)).cases[0].assessmentDraft.reason).toBe(
    "Проверка качества на узком экране",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

async function login(page: Page, role = "quality") {
  await page.getByLabel("Email", { exact: true }).fill(`${role}@pharmaq.demo`);
  await page.getByLabel("Пароль", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeVisible();
}
async function role(page: Page, name: string) {
  await page.getByRole("button", { name: "Профиль пользователя" }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, name);
}
async function registry(page: Page) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Отклонения", exact: true })
    .click();
}
async function openCase(page: Page, title: string) {
  await registry(page);
  await page.getByRole("textbox", { name: "Поиск отклонений" }).fill(title);
  await page.getByRole("button", { name: title, exact: true }).click();
}
async function section(page: Page, name: string) {
  await page
    .locator(".section-links")
    .getByRole("button", { name, exact: true })
    .click();
}
async function action(
  page: Page,
  name: string,
  data: Record<string, string> = {},
) {
  await page
    .getByLabel("Действие", { exact: true })
    .selectOption({ label: name });
  for (const [label, text] of Object.entries(data))
    await page.getByLabel(label, { exact: true }).fill(text);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".inspector .section-links")).toBeVisible();
}
async function taskFromOverview(page: Page, title: string) {
  const group = page
    .locator(".inspector-body details")
    .filter({ has: page.locator("summary", { hasText: /^Задания/ }) });
  if ((await group.getAttribute("open")) === null)
    await group.locator("summary").click();
  await page
    .locator(".compact-list")
    .getByRole("button", { name: new RegExp(title) })
    .click();
}
async function screenshot(page: Page, name: string) {
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.locator("dialog, .inspector").evaluateAll((elements) =>
    elements.forEach((e) => {
      e.scrollTop = 0;
    }),
  );
  await page.screenshot({
    path: `artifacts/screenshots/${name}.png`,
    fullPage: true,
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("pharmaq-local-v2");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<any>((resolve, reject) => {
      const tx = db.transaction("state");
      const r = tx.objectStore("state").get("root");
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
      r.onerror = () => reject(r.error);
    });
  });
}
async function seed(page: Page, value: unknown) {
  await page.goto("/?empty=1");
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pharmaq-local-v2");
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(value, "root");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, value);
  await page.reload();
}

test("B01: полный рабочий путь через формы, файл, роли, доработка, эффективность, закрытие", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?empty=1");
  await login(page);
  await page.getByRole("button", { name: "Отклонение", exact: true }).click();
  await page.getByLabel("Что произошло *").fill("Проверка полного маршрута");
  await page.getByLabel("Участок / линия *").fill("TAB-01");
  await page
    .getByLabel("Описание фактов *")
    .fill("Проверены реальные сохранения форм и файла в локальном приложении.");
  await page
    .getByLabel("Первичные меры", { exact: true })
    .fill("Материалы сохранены, координатор уведомлён.");
  await page
    .getByText("Затронутые объекты", { exact: false })
    .filter({ hasText: "Затронутые объекты" })
    .first()
    .click();
  await page.getByRole("button", { name: "Добавить объект" }).click();
  await page.getByLabel("Название объекта 1").fill("Лактоза");
  await page.getByRole("button", { name: "Добавить объект" }).click();
  await page.getByLabel("Название объекта 2").fill("Партия таблеток");
  await page
    .locator("dialog summary")
    .filter({ hasText: /^Вложения/ })
    .click();
  await page.getByLabel("Файлы", { exact: true }).setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("PharmaQ exact file bytes\nРусский текст"),
  });
  await screenshot(page, "05-create");
  await page
    .getByRole("button", { name: "Зарегистрировать отклонение" })
    .click();
  await expect(page.locator(".inspector h2")).toHaveText(
    "Проверка полного маршрута",
  );
  await page.reload();
  await openCase(page, "Проверка полного маршрута");
  await page.getByRole("button", { name: "Документы 1", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать evidence.txt" }).click();
  const downloaded = await downloadEvent;
  expect(await readFile((await downloaded.path())!, "utf8")).toBe(
    "PharmaQ exact file bytes\nРусский текст",
  );
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await section(page, "Оценка");
  await page
    .getByLabel("Основание критичности", { exact: true })
    .fill("Оценено влияние на два объекта");
  await page
    .getByLabel("Объём расследования", { exact: true })
    .fill("Проверить факты, журнал и возможные причины");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await section(page, "Оценка");
  await expect(
    page.getByLabel("Основание критичности", { exact: true }),
  ).toHaveValue("Оценено влияние на два объекта");
  await page.getByLabel("Действие", { exact: true }).selectOption("confirm");
  await page
    .getByRole("button", { name: "Подтвердить оценку", exact: true })
    .click();
  await role(page, "manager");
  await openCase(page, "Проверка полного маршрута");
  await section(page, "Расследование");
  for (const [name, text] of [
    ["Собранные факты", "Факты наблюдения"],
    ["Хронология", "Обнаружение, первичные действия, обследование"],
    ["Проверенные гипотезы", "Настройка и организация контроля"],
    ["Доказательства и ограничения", "Протокол обследования"],
    ["Итог расследования", "Контроль следует уточнить"],
    ["Подтверждённая причина", "Недостаточно подробная контрольная операция"],
  ])
    await page.getByLabel(name, { exact: true }).fill(text);
  await page.getByLabel("Действие", { exact: true }).selectOption("submit");
  await page
    .getByRole("button", { name: "Представить вывод качеству", exact: true })
    .click();
  await role(page, "quality");
  await openCase(page, "Проверка полного маршрута");
  await section(page, "Расследование");
  await page
    .getByLabel("Решение качества о дальнейших действиях *")
    .fill("Вывод рассмотрен. Подготовить план и проверку.");
  await page
    .getByRole("button", { name: "Подтвердить рассмотрение вывода" })
    .click();
  await role(page, "manager");
  await openCase(page, "Проверка полного маршрута");
  await section(page, "План мер");
  await page.getByRole("button", { name: "Добавить меру / задание" }).click();
  let spec = page.locator(".task-spec").nth(0);
  await spec
    .getByLabel("Конкретное действие *")
    .fill("Уточнить контрольную операцию");
  await spec.getByLabel("Ожидаемый результат *").fill("Проверяемая операция");
  await spec
    .getByLabel("Критерии приёмки *")
    .fill("Контрольный пример выполнен");
  await spec
    .getByLabel("Требуемые доказательства *")
    .fill("Протокол контрольного примера");
  await page
    .getByRole("button", { name: "Проверка эффективности", exact: true })
    .click();
  spec = page.locator(".task-spec").nth(1);
  await spec.getByLabel("Конкретное действие *").fill("Проверить эффект");
  await spec.getByLabel("Ожидаемый результат *").fill("Причина устранена");
  await spec
    .getByLabel("Критерии приёмки *")
    .fill("Нет повторного несоответствия");
  await spec
    .getByLabel("Требуемые доказательства *")
    .fill("Результаты измерений");
  await spec.getByLabel("Метод проверки *").fill("Контрольный запуск");
  await spec.getByLabel("Наблюдение после приёмки, часов").fill("0");
  await spec
    .getByLabel("Зависит от заданий")
    .selectOption({ label: "Уточнить контрольную операцию" });
  await page
    .getByLabel("Основание версии *")
    .fill("Меры и критерии проверки определены");
  await page.getByRole("button", { name: "Сохранить версию плана" }).click();
  await section(page, "План мер");
  await page
    .getByRole("button", { name: "Отправить v1 на согласование" })
    .click();
  await section(page, "План мер");
  await page
    .getByLabel("Основание *", { exact: true })
    .fill("Техническая часть согласована");
  await page
    .getByRole("button", { name: "Сохранить решение по версии" })
    .click();
  await role(page, "quality");
  await openCase(page, "Проверка полного маршрута");
  await section(page, "План мер");
  await page.getByLabel("Основание *", { exact: true }).fill("План достаточен");
  await page
    .getByRole("button", { name: "Сохранить решение по версии" })
    .click();
  await role(page, "employee");
  await openCase(page, "Проверка полного маршрута");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await action(page, "Принять назначение");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await action(page, "Начать работу");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await action(page, "Сдать результат", {
    "Результат и доказательства *": "Первая попытка, требуется проверка",
    "Автор / источник подтверждения *": "Исполнитель",
  });
  await role(page, "manager");
  await openCase(page, "Проверка полного маршрута");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await page.getByLabel("Решение", { exact: true }).selectOption("deficient");
  await page
    .getByLabel("Основание / конкретные замечания *")
    .fill("Добавить результат контрольного измерения");
  await page
    .getByRole("button", { name: "Принять или вернуть результат", exact: true })
    .click();
  await role(page, "employee");
  await openCase(page, "Проверка полного маршрута");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await action(page, "Начать работу");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await action(page, "Сдать результат", {
    "Результат и доказательства *": "Измерение приложено, критерии выполнены",
    "Автор / источник подтверждения *": "Исполнитель",
  });
  await role(page, "manager");
  await openCase(page, "Проверка полного маршрута");
  await taskFromOverview(page, "Уточнить контрольную операцию");
  await screenshot(page, "03-task");
  await action(page, "Принять или вернуть результат", {
    "Основание / конкретные замечания *": "Замечания устранены",
  });
  await taskFromOverview(page, "Проверить эффект");
  await action(page, "Принять назначение");
  await taskFromOverview(page, "Проверить эффект");
  await action(page, "Начать работу");
  await taskFromOverview(page, "Проверить эффект");
  await action(page, "Сдать результат", {
    "Результат и доказательства *": "Контрольный запуск без повторения",
    "Автор / источник подтверждения *": "Руководитель проверки",
  });
  await role(page, "quality");
  await openCase(page, "Проверка полного маршрута");
  await taskFromOverview(page, "Проверить эффект");
  await action(page, "Принять или вернуть результат", {
    "Основание / конкретные замечания *": "Проверка подтверждает результат",
  });
  await section(page, "Решение о закрытии");
  await page
    .getByLabel("Основание решения *")
    .fill("Все обязательства и проверка завершены");
  await page
    .getByRole("button", { name: "Закрыть отклонение", exact: true })
    .click();
  await expect(page.locator(".inspector .stage")).toHaveText("Закрыто");
  const final = await state(page);
  expect(
    final.cases[0].tasks.find(
      (t: any) => t.title === "Уточнить контрольную операцию",
    ).attempts,
  ).toHaveLength(2);
  expect(final.cases[0].stage).toBe("closed");
  expect(final.cases[0].objects).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("B02: реестр, поиск, комбинированные фильтры, столбцы, страницы, защита черновика", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  await registry(page);
  await expect(page.locator(".register-table tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Следующая страница" }).click();
  await expect(page.locator(".register-table tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Предыдущая страница" }).click();
  await page.getByRole("textbox", { name: "Поиск отклонений" }).fill("RM-8821");
  await expect(page.locator(".register-table tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Несоответствие сырья", exact: true })
    .click();
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await expect(
    page.getByRole("textbox", { name: "Поиск отклонений" }),
  ).toHaveValue("RM-8821");
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page.getByLabel("Участок", { exact: true }).selectOption("WH-02");
  await expect(
    page.getByText("Записи не найдены", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page.getByRole("button", { name: "Столбцы", exact: true }).click();
  await page.getByLabel("Объекты / серии", { exact: true }).check();
  await expect(
    page.getByRole("columnheader", { name: "Объекты / серии" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Температура хранения", exact: true })
    .click();
  await section(page, "Оценка");
  await page
    .getByLabel("Основание критичности", { exact: true })
    .fill("Несохранённый текст");
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить редактирование" }).click();
  await expect(
    page.getByLabel("Основание критичности", { exact: true }),
  ).toHaveValue("Несохранённый текст");
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await page.getByRole("button", { name: "Продолжить без сохранения" }).click();
});

test("B03: legacy и ошибка входа, роль admin, восстановление сессии без пароля", async ({
  page,
}) => {
  const legacy = [
    {
      id: 12,
      number: "DEV-2026-0012",
      title: "Сохранённое отклонение",
      status: "Просрочено",
      owner: "Неизвестный ранее участник",
      date: "21.10.2026",
      due: "29.10.2026",
      comments: [
        {
          author: "Елена Ким",
          text: "Старый комментарий",
          time: "Сегодня, 09:42",
        },
      ],
      capa: [],
    },
  ];
  await page.addInitScript((value) => {
    if (!localStorage.getItem("legacy-test")) {
      localStorage.setItem("pharmaq-deviations", JSON.stringify(value));
      localStorage.setItem("legacy-test", "yes");
    }
  }, legacy);
  await page.goto("/");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator("p.error[role=alert]")).toContainText("Неверный");
  await login(page, "admin");
  await registry(page);
  await page
    .getByRole("button", { name: "Сохранённое отклонение", exact: true })
    .click();
  await expect(page.locator(".inspector .stage")).toHaveText("Уточнить этап");
  await section(page, "Решение о закрытии");
  await expect(
    page.getByText("Ваша роль не даёт этого права.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await registry(page);
  await expect(page.locator(".register-table tbody tr")).toHaveCount(1);
  const session = await page.evaluate(() =>
    localStorage.getItem("pharmaq-session"),
  );
  expect(JSON.parse(session!)).toEqual({ userId: "admin" });
  expect((await state(page)).cases[0].legacy.raw).toEqual(legacy[0]);
});

test("B04: несколько вкладок сохраняют ввод и показывают конфликт", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await login(page);
  await openCase(page, "Несоответствие сырья");
  await section(page, "Оценка");
  await page
    .getByLabel("Основание критичности", { exact: true })
    .fill("Ввод первой вкладки");
  const second = await context.newPage();
  await second.goto("/");
  await openCase(second, "Несоответствие сырья");
  await section(second, "Оценка");
  await second
    .getByLabel("Основание критичности", { exact: true })
    .fill("Сохранено второй вкладкой");
  await second
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.locator(".conflict-banner")).toBeVisible();
  await expect(
    page.getByLabel("Основание критичности", { exact: true }),
  ).toHaveValue("Ввод первой вкладки");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.locator(".editor-form .error")).toContainText(
    "другой вкладке",
  );
  expect(
    (await state(page)).cases.find(
      (c: any) => c.title === "Несоответствие сырья",
    ).assessmentDraft.reason,
  ).toBe("Сохранено второй вкладкой");
});

test("B05: скриншоты, размеры 1920/1440/1280/768/390, клавиатура и консоль", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await login(page);
  await screenshot(page, "01-my-work");
  await registry(page);
  await page
    .getByRole("button", { name: "Температура хранения", exact: true })
    .click();
  await screenshot(page, "02-registry-inspector");
  for (const width of [1920, 1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Закрыть карточку" }),
    ).toBeVisible();
    await screenshot(page, `responsive-${width}`);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Открыть навигацию" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Отчёты", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "04-reports");
  expect(errors).toEqual([]);
});

test("B06: ошибочный ввод, тип и размер файла, просмотр, версия документа и уведомление", async ({
  page,
}) => {
  await page.goto("/?empty=1");
  await login(page, "employee");
  await page.getByRole("button", { name: "Отклонение", exact: true }).click();
  await page
    .getByRole("button", { name: "Зарегистрировать отклонение" })
    .click();
  expect((await state(page)).cases.length).toBe(0);
  await page.getByLabel("Что произошло *").fill("Проверка ошибок и документов");
  await page.getByLabel("Участок / линия *").fill("TAB-01");
  await page.getByLabel("Описание фактов *").fill("Фактические наблюдения");
  await page
    .getByLabel("Когда обнаружено *")
    .fill(localInput(new Date(Date.now() + 86400000).toISOString()));
  await page
    .getByRole("button", { name: "Зарегистрировать отклонение" })
    .click();
  await expect(page.locator(".editor-form .error")).toContainText("будущем");
  await page
    .getByLabel("Когда обнаружено *")
    .fill(localInput(new Date(Date.now() - 60000).toISOString()));
  await page
    .locator("dialog summary")
    .filter({ hasText: /^Вложения/ })
    .click();
  const input = page.getByLabel("Файлы", { exact: true });
  await input.setInputFiles({
    name: "bad.exe",
    mimeType: "application/x-msdownload",
    buffer: Buffer.from("bad"),
  });
  await expect(page.locator("dialog p.error")).toContainText("Допустимы");
  await input.setInputFiles({
    name: "huge.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.locator("dialog p.error")).toContainText("20 МБ");
  await input.setInputFiles({
    name: "version-one.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("first bytes"),
  });
  await page
    .getByRole("button", { name: "Зарегистрировать отклонение" })
    .click();
  await page.getByRole("button", { name: "Документы 1", exact: true }).click();
  await page.getByRole("button", { name: "Просмотр version-one.txt" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("body")).toContainText(
    "first bytes",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".inspector")).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Добавить документы/ })
    .click();
  await page
    .getByLabel("Новая версия документа", { exact: true })
    .selectOption({ label: "version-one.txt · v1" });
  await page
    .getByLabel("Автор / источник *", { exact: true })
    .fill("Автор подрядчика");
  await page.getByLabel("Файлы", { exact: true }).setInputFiles({
    name: "version-two.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second bytes"),
  });
  await page
    .getByRole("button", { name: "Сохранить файлы", exact: true })
    .click();
  await page.reload();
  await openCase(page, "Проверка ошибок и документов");
  await page.getByRole("button", { name: "Документы 2", exact: true }).click();
  const docs = (await state(page)).documents;
  expect(docs.map((d: any) => d.version)).toEqual([1, 2]);
  expect(docs[1].source).toBe("Автор подрядчика");
  expect(docs[1].uploadedBy).toBe("employee");
  await role(page, "quality");
  await page.getByRole("button", { name: /Уведомления:/ }).click();
  await page
    .locator(".notifications-popover")
    .getByRole("button", { name: /Оцените DEV/ })
    .click();
  await expect(
    page.getByLabel("Основание критичности", { exact: true }),
  ).toBeVisible();
  expect(
    (await state(page)).notifications.filter((n: any) => n.readAt),
  ).toHaveLength(1);
});

test("B07: подрядчик, ожидание, передача без смены принимающего и продление срока через формы", async ({
  page,
}) => {
  const m = new Harness(
    new Date(Date.now() - 86400000).toISOString(),
  ).external();
  await seed(page, m.state);
  await login(page, "employee");
  await openCase(page, m.c.title);
  await taskFromOverview(page, "Мера A");
  await action(page, "Принять назначение");
  await taskFromOverview(page, "Мера A");
  await action(page, "Начать работу");
  await taskFromOverview(page, "Мера A");
  await action(page, "Перевести в ожидание", {
    "Ожидаемый результат / зависимость *": "Новый протокол",
    "Основание *": "Нет необходимых результатов",
  });
  await page.reload();
  await openCase(page, m.c.title);
  await taskFromOverview(page, "Мера A");
  await expect(page.locator(".task-heading .status")).toHaveText("Ожидание");
  await action(page, "Возобновить работу");
  await taskFromOverview(page, "Мера A");
  await page
    .getByLabel("Действие", { exact: true })
    .selectOption("request_transfer");
  await page
    .getByLabel("Новый участник", { exact: true })
    .selectOption("manager");
  await page
    .getByLabel("Основание *", { exact: true })
    .fill("Сопровождение передаётся руководителю");
  await page
    .getByRole("button", {
      name: "Запросить передачу ответственности",
      exact: true,
    })
    .click();
  let task = (await state(page)).cases[0].tasks.find((t: any) => t.id === "A");
  expect(task.ownerId).toBe("employee");
  await role(page, "manager");
  await openCase(page, m.c.title);
  await taskFromOverview(page, "Мера A");
  // Explicitly appoint an independent reviewer before transferring external supervision to the former reviewer.
  await page
    .getByLabel("Действие", { exact: true })
    .selectOption("replace_assignment");
  await page
    .getByLabel("Назначение", { exact: true })
    .selectOption("reviewerId");
  await page
    .getByLabel("Новый участник", { exact: true })
    .selectOption("quality");
  await page
    .getByLabel("Основание *", { exact: true })
    .fill("Независимая приёмка после передачи");
  await page
    .getByRole("button", {
      name: "Заменить исполнителя / принимающего",
      exact: true,
    })
    .click();
  await taskFromOverview(page, "Мера A");
  await action(page, "Решение по входящей передаче", {
    "Основание *": "Сопровождение принято",
  });
  task = (await state(page)).cases[0].tasks.find((t: any) => t.id === "A");
  expect(task.ownerId).toBe("manager");
  expect(task.performerId).toBe("manager");
  expect(task.reviewerId).toBe("quality");
  await taskFromOverview(page, "Мера A");
  await action(page, "Перенести срок", {
    "Новый срок *": localInput(
      new Date(Date.now() + 5 * 86400000).toISOString(),
    ),
    "Основание *": "Согласован дополнительный протокол",
  });
  task = (await state(page)).cases[0].tasks.find((t: any) => t.id === "A");
  expect(task.deadlineChanges).toHaveLength(1);
  expect(task.originalDue).toBe(m.task().originalDue);
  expect(task.waits[0].end).toBeTruthy();
});

test("B08: настройки сохраняются, справочник не теряет старые связи, восстановление повреждённой миграции", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("recovery-test")) {
      localStorage.setItem("pharmaq-deviations", "{broken");
      localStorage.setItem("recovery-test", "yes");
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Данные не открыты" }),
  ).toBeVisible();
  const legacy = [
    {
      id: 5,
      number: "DEV-2026-0005",
      title: "Восстановленная запись",
      status: "Просрочено",
    },
  ];
  await page
    .getByLabel("Восстановить исправленный файл прежних записей (.json)")
    .setInputFiles({
      name: "recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
  await login(page, "admin");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page.getByLabel("Название линии", { exact: true }).fill("Линия пилота");
  await page
    .getByRole("button", { name: "Сохранить настройки", exact: true })
    .click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByLabel("Имя / название *").fill("Новый специалист");
  await page
    .getByRole("button", { name: "Сохранить запись", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".line-context")).toHaveText("Линия пилота");
  expect(
    (await state(page)).people.some((p: any) => p.name === "Новый специалист"),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("pharmaq-deviations")),
  ).toBe("{broken");
  await registry(page);
  await expect(
    page.getByRole("button", { name: "Восстановленная запись", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".page-heading")
      .getByRole("button", { name: "Отклонение", exact: true }),
  ).toHaveCount(0);
});

test("B09: маршрут без мер, обязательное внешнее решение, закрытое чтение и отчёт", async ({
  page,
}) => {
  const m = new Harness(new Date(Date.now() - 86400000).toISOString());
  m.assess();
  m.investigate(true);
  await seed(page, m.state);
  await login(page);
  await openCase(page, m.c.title);
  await section(page, "Решение о закрытии");
  await page.getByLabel("Маршрут", { exact: true }).selectOption("no_measures");
  await page
    .getByLabel("Основание решения *")
    .fill("Существующий контроль достаточен по результатам оценки");
  await page
    .getByRole("button", { name: "Зафиксировать решение", exact: true })
    .click();
  await section(page, "Внешние решения");
  await page
    .locator("summary")
    .filter({ hasText: "Добавить необходимое решение" })
    .click();
  await page.getByLabel("Объект решения *").fill("Партия B-12");
  await page.getByLabel("Тип решения *").fill("Статус использования");
  await page.getByLabel("Внешний ответственный *").fill("Уполномоченное лицо");
  await page
    .getByRole("button", { name: "Добавить внешнее решение", exact: true })
    .click();
  await section(page, "Решение о закрытии");
  await page.getByLabel("Основание решения *").fill("Проверка блокировки");
  await page
    .getByRole("button", { name: "Закрыть отклонение", exact: true })
    .click();
  await expect(page.locator(".editor-form .error")).toContainText(
    "внешнего решения",
  );
  await page
    .locator(".blockers")
    .getByRole("button", { name: /Нет внешнего решения/ })
    .click();
  await page
    .getByRole("button", { name: "Продолжить без сохранения", exact: true })
    .click();
  await page
    .getByLabel("Содержание внешнего решения *")
    .fill("Решение получено из внешнего процесса");
  await page.getByLabel("Номер / ссылка на документ *").fill("Протокол №12");
  await page.getByLabel("Автор решения *").fill("Уполномоченное лицо");
  await page
    .getByLabel("Дата решения *")
    .fill(localInput(new Date(Date.now() - 60000).toISOString()));
  await page
    .getByRole("button", {
      name: "Зарегистрировать внешнее решение",
      exact: true,
    })
    .click();
  await section(page, "Решение о закрытии");
  await page
    .getByLabel("Основание решения *")
    .fill("Материалы и внешнее решение рассмотрены");
  await page
    .getByRole("button", { name: "Закрыть отклонение", exact: true })
    .click();
  await section(page, "Внешние решения");
  await expect(
    page.getByRole("button", { name: "Добавить внешнее решение", exact: true }),
  ).toHaveCount(0);
  await page.locator("summary").filter({ hasText: "Партия B-12" }).click();
  await expect(
    page.getByText("Решение получено из внешнего процесса", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть карточку" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Отчёты", exact: true })
    .click();
  await expect(
    page
      .locator(".metrics > div")
      .filter({ hasText: "Закрыто с известными датами" })
      .locator("strong"),
  ).toHaveText("1");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect(await readFile((await (await downloaded).path())!, "utf8")).toContain(
    "Среднее время закрытия",
  );
  await page.getByLabel("Регистрация с", { exact: true }).fill("2099-01-01");
  await expect(
    page
      .locator(".metrics > div")
      .filter({ hasText: "Всего в периоде" })
      .locator("strong"),
  ).toHaveText("0");
});
