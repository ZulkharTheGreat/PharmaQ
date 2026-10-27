"use client";
import { useState } from "react";
import { ObjectEditor } from "./object-editor";
import { AffectedObject } from "../lib/domain/types";
import { inputISO, localInput } from "../lib/domain/time";
import { useApp } from "./context";
import {
  Field,
  FilePicker,
  Form,
  PeopleSelect,
  prepareFiles,
  value,
} from "./forms";
export function CreateForm({
  onDone,
  onDirty,
  relatedCaseId,
}: {
  onDone: () => void;
  onDirty: (v: boolean) => void;
  relatedCaseId?: string;
}) {
  const { state, user, now, run, open } = useApp();
  const [revision] = useState(state.revision);
  const [files, setFiles] = useState<File[]>([]);
  const [objects, setObjects] = useState<AffectedObject[]>([]);
  return (
    <Form
      label="Зарегистрировать отклонение"
      onDirty={onDirty}
      submit={async (f) => {
        const data: Record<string, unknown> = {};
        for (const key of [
          "title",
          "description",
          "department",
          "line",
          "area",
          "place",
          "detector",
          "expected",
          "actual",
          "immediateActions",
          "impact",
          "safety",
          "amount",
          "coordinatorId",
        ])
          data[key] = value(f, key);
        data.detectedAt = inputISO(value(f, "detectedAt"));
        data.objects = objects;
        if (relatedCaseId) data.relatedCaseId = relatedCaseId;
        const attached = prepareFiles(
          files,
          value(f, "source") || user.name,
          new Date().toISOString(),
        );
        const result = await run(
          "register",
          { ...data, documents: attached.documents },
          undefined,
          undefined,
          revision,
          attached.uploads,
        );
        onDone();
        open(result.caseId!);
      }}
    >
      <div className="form-grid">
        <Field label="Что произошло *" wide>
          <input
            name="title"
            required
            maxLength={300}
            autoFocus
            placeholder="Краткое название события"
          />
        </Field>
        <Field label="Когда обнаружено *">
          <input
            name="detectedAt"
            type="datetime-local"
            required
            defaultValue={localInput(now)}
          />
        </Field>
        <Field label="Подразделение *">
          <input name="department" required defaultValue={user.department} />
        </Field>
        <Field label="Участок / линия *">
          <input name="line" list="areas" required />
          <datalist id="areas">
            {state.areas
              .filter((x) => x.active)
              .map((x) => (
                <option key={x.id} value={x.name} />
              ))}
          </datalist>
        </Field>
        <Field label="Координатор качества *">
          <PeopleSelect
            name="coordinatorId"
            quality
            value={state.settings.coordinatorId}
          />
        </Field>
        <Field label="Описание фактов *" wide>
          <textarea name="description" required rows={4} />
        </Field>
        <Field label="Первичные меры" wide>
          <textarea name="immediateActions" rows={2} />
        </Field>
      </div>
      <details>
        <summary>Место и дополнительные сведения</summary>
        <div className="form-grid">
          {[
            ["area", "Производственная зона"],
            ["place", "Место обнаружения"],
            ["detector", "Обнаружил"],
            ["amount", "Затронутое количество"],
            ["expected", "Ожидаемый процесс"],
            ["actual", "Фактическая ситуация"],
            ["impact", "Наблюдаемое влияние на продукцию"],
            ["safety", "Сведения о безопасности"],
          ].map(([name, label]) => (
            <Field key={name} label={label}>
              <input
                name={name}
                defaultValue={name === "detector" ? user.name : ""}
              />
            </Field>
          ))}
        </div>
      </details>
      <ObjectEditor
        objects={objects}
        setObjects={setObjects}
        onDirty={onDirty}
      />
      <details>
        <summary>
          Вложения <span className="count">{files.length}</span>
        </summary>
        <Field label="Автор / источник документов">
          <input name="source" defaultValue={user.name} />
        </Field>
        <FilePicker
          files={files}
          setFiles={(v) => {
            setFiles(v);
            onDirty(true);
          }}
        />
      </details>
      {relatedCaseId && (
        <p className="hint">
          Новый случай будет связан с{" "}
          {state.cases.find((c) => c.id === relatedCaseId)?.number}. Предыдущее
          дело сохранится.
        </p>
      )}
    </Form>
  );
}
