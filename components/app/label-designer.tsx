"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Star, Save, Undo2, Redo2 } from "lucide-react";
import {
  LABEL_FIELDS,
  LABEL_ELEMENT_TYPES,
  LABEL_ELEMENT_LABELS,
  defaultLabelDesign,
  newLabelElement,
  newElementId,
  type LabelDesign,
  type LabelElement,
  type LabelElementType,
} from "@/lib/print/templates";
import { savePrintTemplate, setDefaultPrintTemplate, deletePrintTemplate, type StoredTemplate } from "@/app/actions/print-templates";
import { LABEL_SYMBOLOGIES } from "@/components/app/barcode-svg";
import { LabelPreview, labelFieldLabel, type LabelData } from "@/components/app/label-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Drag-and-drop label designer.
 *
 * A label is a fixed-size box with free-floating elements — no text flow and
 * no pagination — which is exactly the shape a canvas editor suits. Positions
 * are kept in millimetres and only converted to pixels for drawing, so the
 * same design renders identically on screen and on 50 × 25 mm label stock.
 */

/** On-screen zoom. Label stock is small, so the canvas magnifies it heavily. */
const PX_PER_MM = 6;
/** Positions snap to this, in mm — fine enough to be precise, coarse enough to be tidy. */
const SNAP_MM = 0.5;

const snap = (value: number) => Math.round(value / SNAP_MM) * SNAP_MM;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "resize"; id: string; startX: number; startY: number; originW: number; originH: number };

export function LabelDesigner({
  templates,
  sampleData,
  canManage,
}: {
  templates: StoredTemplate<LabelDesign>[];
  sampleData: LabelData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState<string | null>(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? null);
  const initial = templates.find((t) => t.id === templateId);

  const [name, setName] = React.useState(initial?.name ?? "Shelf label");
  const [design, setDesign] = React.useState<LabelDesign>(initial?.design ?? defaultLabelDesign());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Undo/redo over whole designs. A label design is a few kilobytes, so
  // snapshotting is simpler and more reliable than a command log.
  const [past, setPast] = React.useState<LabelDesign[]>([]);
  const [future, setFuture] = React.useState<LabelDesign[]>([]);
  const dragRef = React.useRef<DragState | null>(null);
  /** The design as it was when a drag began, so one drag is one undo step. */
  const dragBaselineRef = React.useRef<LabelDesign | null>(null);

  const selected = design.elements.find((e) => e.id === selectedId) ?? null;

  /** `commit` records an undo point; a drag defers that until the pointer is released. */
  const update = React.useCallback((next: LabelDesign, commit = true) => {
    if (commit) {
      setPast((p) => [...p.slice(-40), design]);
      setFuture([]);
    }
    setDesign(next);
  }, [design]);

  function patchElement(id: string, patch: Partial<LabelElement>, commit = true) {
    update({ ...design, elements: design.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }, commit);
  }

  function loadTemplate(id: string) {
    const found = templates.find((t) => t.id === id);
    setTemplateId(id);
    setSelectedId(null);
    setPast([]);
    setFuture([]);
    if (found) {
      setName(found.name);
      setDesign(found.design);
    }
  }

  function undo() {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [design, ...f].slice(0, 40));
      setDesign(previous);
      return p.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      setPast((p) => [...p, design]);
      setDesign(f[0]);
      return f.slice(1);
    });
  }

  /* ------------------------------------------------------------- dragging */

  function beginDrag(event: React.PointerEvent, element: LabelElement, mode: "move" | "resize") {
    if (!canManage) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setSelectedId(element.id);
    dragBaselineRef.current = design;
    dragRef.current =
      mode === "move"
        ? { mode, id: element.id, startX: event.clientX, startY: event.clientY, originX: element.x, originY: element.y }
        : { mode, id: element.id, startX: event.clientX, startY: event.clientY, originW: element.w, originH: element.h };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dxMm = (event.clientX - drag.startX) / PX_PER_MM;
    const dyMm = (event.clientY - drag.startY) / PX_PER_MM;
    const element = design.elements.find((e) => e.id === drag.id);
    if (!element) return;

    if (drag.mode === "move") {
      patchElement(
        drag.id,
        {
          // Elements stay on the label; a label you cannot see is not a design.
          x: clamp(snap(drag.originX + dxMm), 0, Math.max(0, design.widthMm - element.w)),
          y: clamp(snap(drag.originY + dyMm), 0, Math.max(0, design.heightMm - element.h)),
        },
        false
      );
    } else {
      patchElement(
        drag.id,
        {
          w: clamp(snap(drag.originW + dxMm), 1, design.widthMm - element.x),
          h: clamp(snap(drag.originH + dyMm), element.type === "line" ? 0.5 : 2, design.heightMm - element.y),
        },
        false
      );
    }
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    // Fold the whole gesture into a single undo step.
    const baseline = dragBaselineRef.current;
    dragBaselineRef.current = null;
    if (baseline) {
      setPast((p) => [...p.slice(-40), baseline]);
      setFuture([]);
    }
  }

  /** Arrow keys nudge by one snap step, or 10× with Shift. */
  function onCanvasKeyDown(event: React.KeyboardEvent) {
    if (!selected || !canManage) return;
    const step = event.shiftKey ? SNAP_MM * 10 : SNAP_MM;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelected();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    patchElement(selected.id, {
      x: clamp(snap(selected.x + move[0]), 0, Math.max(0, design.widthMm - selected.w)),
      y: clamp(snap(selected.y + move[1]), 0, Math.max(0, design.heightMm - selected.h)),
    });
  }

  function addElement(type: LabelElementType) {
    const element = newLabelElement(type, design);
    update({ ...design, elements: [...design.elements, element] });
    setSelectedId(element.id);
  }

  function removeSelected() {
    if (!selected) return;
    update({ ...design, elements: design.elements.filter((e) => e.id !== selected.id) });
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: LabelElement = {
      ...selected,
      id: newElementId(),
      x: clamp(selected.x + 2, 0, Math.max(0, design.widthMm - selected.w)),
      y: clamp(selected.y + 2, 0, Math.max(0, design.heightMm - selected.h)),
    };
    update({ ...design, elements: [...design.elements, copy] });
    setSelectedId(copy.id);
  }

  async function save(makeDefault: boolean) {
    setSaving(true);
    const result = await savePrintTemplate({ templateId, kind: "label", name, design, makeDefault });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.templateId) setTemplateId(result.templateId);
    toast.success(makeDefault ? "Saved and set as the default label" : "Label design saved");
    router.refresh();
  }

  const templateItems = React.useMemo(
    () => [
      { value: "new", label: "＋ New design" },
      ...templates.map((t) => ({ value: t.id, label: t.isDefault ? `${t.name} (default)` : t.name })),
    ],
    [templates]
  );
  const fieldItems = React.useMemo(() => LABEL_FIELDS.map((f) => ({ value: f.key, label: f.label })), []);
  const symbologyItems = React.useMemo(
    () => LABEL_SYMBOLOGIES.filter((s) => s.value !== "qr").map((s) => ({ value: s.value, label: s.label })),
    []
  );
  const alignItems = React.useMemo(
    () => [
      { value: "left", label: "Left" },
      { value: "center", label: "Centre" },
      { value: "right", label: "Right" },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Design</label>
            <div className="w-56">
              <Select
                items={templateItems}
                value={templateId ?? "new"}
                onValueChange={(v) => {
                  if (!v || v === "new") {
                    setTemplateId(null);
                    setName("New label");
                    setDesign(defaultLabelDesign());
                    setSelectedId(null);
                    setPast([]);
                    setFuture([]);
                    return;
                  }
                  loadTemplate(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a design" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">＋ New design</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.isDefault ? `${t.name} (default)` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="label-design-name">
              Name
            </label>
            <Input id="label-design-name" value={name} onChange={(e) => setName(e.target.value)} className="w-48" disabled={!canManage} />
          </div>

          <div className="flex gap-1">
            <Button variant="ghost" size="icon" aria-label="Undo" disabled={past.length === 0} onClick={undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Redo" disabled={future.length === 0} onClick={redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {canManage && (
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => void save(false)}>
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button disabled={saving} onClick={() => void save(true)}>
                <Star className="h-4 w-4" />
                Save as default
              </Button>
              {templateId && (
                <>
                  {!templates.find((t) => t.id === templateId)?.isDefault && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const result = await setDefaultPrintTemplate(templateId, "label");
                        if (!result.ok) toast.error(result.error);
                        else {
                          toast.success("Default label design updated");
                          router.refresh();
                        }
                      }}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete design"
                    onClick={async () => {
                      if (!confirm(`Delete the "${name}" label design?`)) return;
                      const result = await deletePrintTemplate(templateId);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Design deleted");
                      setTemplateId(null);
                      setDesign(defaultLabelDesign());
                      router.refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------------------------------- canvas */}
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Canvas</p>
              <span className="text-xs text-muted-foreground">
                {design.widthMm} × {design.heightMm} mm · drag to move, corner to resize, arrows to nudge
              </span>
            </div>

            {canManage && (
              <div className="flex flex-wrap gap-1.5">
                {LABEL_ELEMENT_TYPES.map((type) => (
                  <Button key={type} variant="secondary" size="sm" onClick={() => addElement(type)}>
                    <Plus className="h-3 w-3" />
                    {LABEL_ELEMENT_LABELS[type]}
                  </Button>
                ))}
              </div>
            )}

            <div
              role="application"
              aria-label="Label canvas"
              tabIndex={0}
              onKeyDown={onCanvasKeyDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => setSelectedId(null)}
              className="relative mx-auto overflow-auto rounded-lg border border-border bg-muted/40 p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className="relative mx-auto"
                style={{
                  width: `${design.widthMm * PX_PER_MM}px`,
                  height: `${design.heightMm * PX_PER_MM}px`,
                  backgroundImage:
                    "linear-gradient(to right, rgba(127,127,127,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,127,127,.25) 1px, transparent 1px)",
                  backgroundSize: `${5 * PX_PER_MM}px ${5 * PX_PER_MM}px`,
                }}
              >
                <LabelPreview design={design} data={sampleData} pxPerMm={PX_PER_MM} style={{ position: "absolute", inset: 0 }} />

                {/* Hit targets sit above the rendered label so the drawing
                    stays pixel-identical to what prints. */}
                {design.elements.map((element) => {
                  const active = element.id === selectedId;
                  return (
                    <div
                      key={element.id}
                      role="button"
                      tabIndex={-1}
                      aria-label={`${LABEL_ELEMENT_LABELS[element.type]} element`}
                      onPointerDown={(e) => beginDrag(e, element, "move")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(element.id);
                      }}
                      style={{
                        position: "absolute",
                        left: `${element.x * PX_PER_MM}px`,
                        top: `${element.y * PX_PER_MM}px`,
                        width: `${element.w * PX_PER_MM}px`,
                        height: `${element.h * PX_PER_MM}px`,
                        cursor: canManage ? "move" : "default",
                        outline: active ? "2px solid var(--color-primary, #d33)" : "1px dashed rgba(120,120,120,.55)",
                        outlineOffset: "0px",
                        touchAction: "none",
                      }}
                    >
                      {active && canManage && (
                        <span
                          role="button"
                          tabIndex={-1}
                          aria-label="Resize element"
                          onPointerDown={(e) => beginDrag(e, element, "resize")}
                          style={{
                            position: "absolute",
                            right: "-5px",
                            bottom: "-5px",
                            width: "10px",
                            height: "10px",
                            background: "var(--color-primary, #d33)",
                            borderRadius: "2px",
                            cursor: "nwse-resize",
                            touchAction: "none",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sheet preview</p>
              <div
                className="flex flex-wrap rounded-lg border border-border bg-white p-3"
                style={{ gap: `${design.gapMm * 3}px`, maxWidth: `${design.columns * (design.widthMm + design.gapMm) * 3 + 24}px` }}
              >
                {Array.from({ length: design.columns * 2 }).map((_, i) => (
                  <LabelPreview key={i} design={design} data={sampleData} pxPerMm={3} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* --------------------------------------------------- properties */}
        <Card>
          <CardContent className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Label stock</p>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Width (mm)"
                  value={design.widthMm}
                  min={10}
                  max={300}
                  disabled={!canManage}
                  onChange={(v) => update({ ...design, widthMm: v })}
                />
                <NumberField
                  label="Height (mm)"
                  value={design.heightMm}
                  min={10}
                  max={300}
                  disabled={!canManage}
                  onChange={(v) => update({ ...design, heightMm: v })}
                />
                <NumberField
                  label="Across the sheet"
                  value={design.columns}
                  min={1}
                  max={12}
                  disabled={!canManage}
                  onChange={(v) => update({ ...design, columns: Math.round(v) })}
                />
                <NumberField
                  label="Gap (mm)"
                  value={design.gapMm}
                  min={0}
                  max={20}
                  disabled={!canManage}
                  onChange={(v) => update({ ...design, gapMm: v })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={design.showBorder}
                  disabled={!canManage}
                  onChange={(e) => update({ ...design, showBorder: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Print a border around each label
              </label>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Selected element</p>
                {selected && canManage && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="Duplicate element" onClick={duplicateSelected}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete element" onClick={removeSelected}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>

              {!selected ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Click an element on the canvas to edit it.</p>
              ) : (
                <div className="space-y-3">
                  <Badge variant="secondary">{LABEL_ELEMENT_LABELS[selected.type]}</Badge>

                  {selected.type === "text" && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Text</label>
                      <Input
                        value={selected.value}
                        disabled={!canManage}
                        onChange={(e) => patchElement(selected.id, { value: e.target.value })}
                      />
                    </div>
                  )}

                  {(selected.type === "field" || selected.type === "barcode" || selected.type === "qr") && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {selected.type === "field" ? "Shows" : "Encodes"}
                      </label>
                      <Select
                        items={fieldItems}
                        value={selected.value}
                        onValueChange={(v) => v && patchElement(selected.id, { value: v })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pick a field" />
                        </SelectTrigger>
                        <SelectContent>
                          {LABEL_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Prints {labelFieldLabel(selected.value).toLowerCase()} per product.</p>
                    </div>
                  )}

                  {selected.type === "barcode" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Symbology</label>
                        <Select
                          items={symbologyItems}
                          value={selected.symbology}
                          onValueChange={(v) => v && patchElement(selected.id, { symbology: v })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {symbologyItems.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={selected.showValue}
                          disabled={!canManage}
                          onChange={(e) => patchElement(selected.id, { showValue: e.target.checked })}
                          className="h-4 w-4 accent-primary"
                        />
                        Print the digits underneath
                      </label>
                    </>
                  )}

                  {(selected.type === "text" || selected.type === "field") && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="Font size (pt)"
                          value={selected.fontSize}
                          min={3}
                          max={48}
                          disabled={!canManage}
                          onChange={(v) => patchElement(selected.id, { fontSize: v })}
                        />
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Align</label>
                          <Select
                            items={alignItems}
                            value={selected.align}
                            onValueChange={(v) => v && patchElement(selected.id, { align: v as LabelElement["align"] })}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {alignItems.map((a) => (
                                <SelectItem key={a.value} value={a.value}>
                                  {a.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={selected.bold}
                          disabled={!canManage}
                          onChange={(e) => patchElement(selected.id, { bold: e.target.checked })}
                          className="h-4 w-4 accent-primary"
                        />
                        Bold
                      </label>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="X (mm)"
                      value={selected.x}
                      min={0}
                      max={design.widthMm}
                      disabled={!canManage}
                      onChange={(v) => patchElement(selected.id, { x: v })}
                    />
                    <NumberField
                      label="Y (mm)"
                      value={selected.y}
                      min={0}
                      max={design.heightMm}
                      disabled={!canManage}
                      onChange={(v) => patchElement(selected.id, { y: v })}
                    />
                    <NumberField
                      label="Width (mm)"
                      value={selected.w}
                      min={0.5}
                      max={design.widthMm}
                      disabled={!canManage}
                      onChange={(v) => patchElement(selected.id, { w: v })}
                    />
                    <NumberField
                      label="Height (mm)"
                      value={selected.h}
                      min={0.5}
                      max={design.heightMm}
                      disabled={!canManage}
                      onChange={(v) => patchElement(selected.id, { h: v })}
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input
        type="number"
        step="0.5"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </div>
  );
}
