"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  FormEvent,
  ReactElement,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { X, Upload as UploadIcon, FileText } from "lucide-react";
import { useApp } from "./context";
import { DocumentRecord, Upload } from "../lib/domain/types";
import { FILE_EXTENSIONS, validateFile } from "../lib/domain/commands";
import { uid } from "../lib/domain/helpers";
export function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={wide ? "field wide" : "field"}>
      <span id={id}>{label}</span>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const element = child as ReactElement<Record<string, unknown>>;
        if (
          typeof element.type === "string" &&
          !["input", "select", "textarea"].includes(element.type)
        )
          return child;
        if (typeof element.type !== "string" && element.type !== PeopleSelect)
          return child;
        if (element.props["aria-label"] || element.props["aria-labelledby"])
          return child;
        return cloneElement(element, { "aria-labelledby": id });
      })}
    </div>
  );
}
export function PeopleSelect({
  name,
  value,
  multiple,
  quality,
  manager,
  required = true,
  "aria-labelledby": labelledBy,
}: {
  name: string;
  value?: string | string[];
  multiple?: boolean;
  quality?: boolean;
  manager?: boolean;
  required?: boolean;
  "aria-labelledby"?: string;
}) {
  const { state } = useApp();
  return (
    <select
      name={name}
      defaultValue={value}
      multiple={multiple}
      required={required}
      aria-labelledby={labelledBy}
    >
      {!multiple && <option value="">Выберите участника</option>}
      {state.people
        .filter(
          (p) =>
            p.active &&
            (quality
              ? p.role === "quality"
              : manager
                ? ["quality", "manager"].includes(p.role)
                : p.role !== "admin"),
        )
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
}
export const value = (f: FormData, key: string) =>
  String(f.get(key) || "").trim();
export function Form({
  children,
  submit,
  label = "Сохранить",
  onDirty,
  footer,
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<unknown>;
  label?: string;
  onDirty?: (dirty: boolean) => void;
  footer?: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await submit(data);
      onDirty?.(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="editor-form"
      onSubmit={onSubmit}
      onChange={() => onDirty?.(true)}
    >
      {children}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="form-footer">
        {footer}
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Сохранение…" : label}
        </button>
      </div>
    </form>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    el?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), select, textarea',
    )?.focus();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Закрыть форму" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function FilePicker({
  files,
  setFiles,
}: {
  files: File[];
  setFiles: (files: File[]) => void;
}) {
  const [error, setError] = useState("");
  const add = (input: File[]) => {
    try {
      input.forEach(validateFile);
      setFiles([...files, ...input]);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div
      className="file-picker"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(Array.from(e.dataTransfer.files));
      }}
    >
      <label className="upload-label">
        <UploadIcon size={18} />
        <span>Выбрать файлы или перетащить сюда</span>
        <input
          aria-label="Файлы"
          type="file"
          multiple
          accept={FILE_EXTENSIONS.map((x) => `.${x}`).join(",")}
          onChange={(e) => {
            add(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </label>
      <small>PDF, изображения, TXT, CSV, Word, Excel · до 20 МБ на файл</small>
      {files.map((file, i) => (
        <div className="file-row" key={`${file.name}-${i}`}>
          <FileText size={16} />
          <span>{file.name}</span>
          <small>{Math.ceil(file.size / 1024)} КБ</small>
          <button
            type="button"
            className="icon"
            aria-label={`Убрать ${file.name}`}
            onClick={() => setFiles(files.filter((_, n) => n !== i))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function prepareFiles(
  files: File[],
  source: string,
  now: string,
  options: { taskId?: string; decisionId?: string; previousId?: string } = {},
) {
  const uploads: Upload[] = [];
  const documents: Partial<DocumentRecord>[] = files.map((file) => {
    validateFile(file);
    const id = uid();
    uploads.push({ id, blob: file });
    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      source,
      occurredAt: now,
      ...options,
    };
  });
  return { uploads, documents };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
