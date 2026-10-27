"use client";
import { Plus, X } from "lucide-react";
import { AffectedObject } from "../lib/domain/types";
import { uid } from "../lib/domain/helpers";
import { useApp } from "./context";
import { Field } from "./forms";
export function ObjectEditor({
  objects,
  setObjects,
  onDirty,
}: {
  objects: AffectedObject[];
  setObjects: (v: AffectedObject[]) => void;
  onDirty: (v: boolean) => void;
}) {
  const { state } = useApp();
  const update = (i: number, key: keyof AffectedObject, val: string) => {
    setObjects(objects.map((o, n) => (n === i ? { ...o, [key]: val } : o)));
    onDirty(true);
  };
  return (
    <details open={objects.length > 0}>
      <summary>
        Затронутые объекты <span className="count">{objects.length}</span>
      </summary>
      {objects.map((o, i) => (
        <div className="object-editor" key={o.id}>
          <div className="row-between">
            <b>Объект {i + 1}</b>
            <button
              type="button"
              className="icon"
              aria-label={`Убрать объект ${i + 1}`}
              onClick={() => {
                setObjects(objects.filter((_, n) => i !== n));
                onDirty(true);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="form-grid">
            <Field label="Тип">
              <select
                value={o.kind}
                onChange={(e) => update(i, "kind", e.target.value)}
              >
                <option value="product">Продукт</option>
                <option value="batch">Производственная партия</option>
                <option value="material">Сырьё</option>
                <option value="equipment">Оборудование</option>
                <option value="area">Участок</option>
              </select>
            </Field>
            <Field label="Название *">
              <input
                aria-label={`Название объекта ${i + 1}`}
                required
                value={o.name}
                onChange={(e) => update(i, "name", e.target.value)}
                list="objects"
              />
            </Field>
            {[
              ["batch", "Серия / партия"],
              ["supplierBatch", "Партия поставщика"],
              ["code", "Код"],
              ["quantity", "Количество / размер партии"],
              ["order", "Производственный заказ"],
              ["productionStage", "Стадия производства"],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  value={o[key as keyof AffectedObject]}
                  onChange={(e) =>
                    update(i, key as keyof AffectedObject, e.target.value)
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      ))}
      <datalist id="objects">
        {state.objects
          .filter((x) => x.active)
          .map((x) => (
            <option key={x.id} value={x.name} />
          ))}
      </datalist>
      <button
        type="button"
        onClick={() => {
          setObjects([
            ...objects,
            {
              id: uid(),
              kind: "product",
              name: "",
              batch: "",
              code: "",
              supplierBatch: "",
              quantity: "",
              order: "",
              productionStage: "",
            },
          ]);
          onDirty(true);
        }}
      >
        <Plus size={16} /> Добавить объект
      </button>
    </details>
  );
}
