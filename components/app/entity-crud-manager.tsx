"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { ZodTypeAny } from "zod";
import { Plus, Pencil, Trash2, Tag, Award, Ruler, Palette, Warehouse, UserSquare2, Stethoscope, Receipt, Percent, Package, Users, Truck, BookOpen, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { categorySchema, brandSchema, sizeSchema, unitSchema, colorSchema, rackSchema, salespersonSchema, doctorSchema, taxRateSchema, hsnCodeSchema } from "@/lib/validation/masters";
import { productSchema } from "@/lib/validation/products";
import { customerSchema, supplierSchema } from "@/lib/validation/parties";
import { accountSchema } from "@/lib/validation/accounting";
import { loyaltyTierSchema, couponSchema } from "@/lib/validation/engagement";

/**
 * Icons and Zod schemas are functions/class instances, which the RSC boundary
 * refuses to accept as props from a Server Component into this Client
 * Component. Route through a string `kind` key instead, resolved to the real
 * icon + schema here (client-side), so pages only ever pass plain data.
 */
const REGISTRY = {
  category: { icon: Tag, schema: categorySchema },
  brand: { icon: Award, schema: brandSchema },
  size: { icon: Ruler, schema: sizeSchema },
  unit: { icon: Ruler, schema: unitSchema },
  color: { icon: Palette, schema: colorSchema },
  rack: { icon: Warehouse, schema: rackSchema },
  salesperson: { icon: UserSquare2, schema: salespersonSchema },
  doctor: { icon: Stethoscope, schema: doctorSchema },
  taxRate: { icon: Percent, schema: taxRateSchema },
  hsnCode: { icon: Receipt, schema: hsnCodeSchema },
  product: { icon: Package, schema: productSchema },
  customer: { icon: Users, schema: customerSchema },
  supplier: { icon: Truck, schema: supplierSchema },
  account: { icon: BookOpen, schema: accountSchema },
  loyaltyTier: { icon: Award, schema: loyaltyTierSchema },
  coupon: { icon: Ticket, schema: couponSchema },
} as const;

export type EntityKind = keyof typeof REGISTRY;

export type CrudField = {
  name: string;
  label: string;
  type: "text" | "select" | "toggle";
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Shown under a toggle to explain what turning it on actually does. */
  hint?: string;
};

/**
 * `render` can't be a function here (see the RSC note above) — a server page
 * can only hand this component plain data, so custom display is expressed
 * declaratively instead: a display `format` plus the lookup table it needs.
 */
export type CrudColumn<T> = {
  key: Extract<keyof T, string>;
  label: string;
  className?: string;
  format?: "currency" | "lookup" | "swatch";
  /** format "lookup": maps the raw cell value to a display label. */
  lookup?: Record<string, string>;
  /** format "swatch": key of the field holding a hex color. */
  swatchKey?: Extract<keyof T, string>;
};

type ActionResult = { ok: true } | { ok: false; error: string };

export function EntityCrudManager<T extends Record<string, unknown> & { id: string }>({
  title,
  kind,
  itemLabel,
  description,
  items,
  columns,
  fields,
  defaultValues,
  createAction,
  updateAction,
  deleteAction,
  canManage,
  emptyLabel,
}: {
  title: string;
  kind: EntityKind;
  /** Singular name for dialog titles and confirm prompts, e.g. "Category" for a "Categories" list. Defaults to `title` with a trailing "s" stripped. */
  itemLabel?: string;
  description?: string;
  items: T[];
  columns: CrudColumn<T>[];
  fields: CrudField[];
  defaultValues: Record<string, unknown>;
  createAction: (input: unknown) => Promise<ActionResult>;
  updateAction: (id: string, input: unknown) => Promise<ActionResult>;
  deleteAction: (id: string) => Promise<ActionResult>;
  canManage: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<T | null>(null);
  const router = useRouter();
  const { icon: Icon, schema } = REGISTRY[kind];

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold leading-tight">{title}</h2>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {emptyLabel ?? `No ${title.toLowerCase()} yet.`}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key} className={c.className}>
                      {c.label}
                    </TableHead>
                  ))}
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className={c.className}>
                        {renderCell(item, c)}
                      </TableCell>
                    ))}
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(item);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={async () => {
                              if (!confirm(`Delete "${String(item.name ?? item.code ?? "this item")}"?`)) return;
                              const result = await deleteAction(item.id);
                              if (!result.ok) {
                                toast.error(result.error);
                                return;
                              }
                              toast.success("Deleted");
                              router.refresh();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {/* `key` forces a remount so react-hook-form re-reads defaultValues
              per item — it otherwise only applies them once, at first mount. */}
          <EntityForm
            key={editing?.id ?? "new"}
            itemLabel={itemLabel ?? title.replace(/s$/, "")}
            fields={fields}
            schema={schema}
            defaultValues={editing ? { ...defaultValues, ...editing } : defaultValues}
            editingId={editing?.id ?? null}
            createAction={createAction}
            updateAction={updateAction}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function renderCell<T extends Record<string, unknown>>(item: T, column: CrudColumn<T>): React.ReactNode {
  const raw = item[column.key];
  if (column.format === "currency") {
    const value = typeof raw === "number" ? raw : parseFloat(String(raw ?? "0"));
    if (Number.isNaN(value)) return "—";
    // Keep the minus sign outside the symbol: -₹900.00, not ₹-900.00.
    return `${value < 0 ? "-" : ""}₹${Math.abs(value).toFixed(2)}`;
  }
  if (column.format === "lookup") return column.lookup?.[String(raw)] ?? "—";
  if (column.format === "swatch") {
    const hex = column.swatchKey ? (item[column.swatchKey] as string | null | undefined) : undefined;
    return (
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 shrink-0 rounded-full border border-border" style={{ backgroundColor: hex || "transparent" }} />
        {String(raw ?? "—")}
      </div>
    );
  }
  return String(raw ?? "—");
}

function EntityForm({
  itemLabel,
  fields,
  schema,
  defaultValues,
  editingId,
  createAction,
  updateAction,
  onSuccess,
}: {
  itemLabel: string;
  fields: CrudField[];
  schema: ZodTypeAny;
  defaultValues: Record<string, unknown>;
  editingId: string | null;
  createAction: (input: unknown) => Promise<ActionResult>;
  updateAction: (id: string, input: unknown) => Promise<ActionResult>;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const form = useForm({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues,
  });

  async function onSubmit(values: Record<string, unknown>) {
    const result = editingId ? await updateAction(editingId, values) : await createAction(values);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(editingId ? "Saved" : "Created");
    form.reset(defaultValues);
    onSuccess();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editingId ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</DialogTitle>
        <DialogDescription className="sr-only">{itemLabel} form</DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {fields.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem className={f.type === "toggle" ? "flex flex-row-reverse items-center justify-end gap-2 space-y-0" : undefined}>
                  <FormLabel className={f.type === "toggle" ? "font-normal" : undefined}>{f.label}</FormLabel>
                  <FormControl>
                    {f.type === "toggle" ? (
                      <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                      />
                    ) : f.type === "select" ? (
                      // `items` lets Select.Value resolve a label immediately, without
                      // waiting for the popup to open and register its Select.Item list.
                      <Select items={f.options ?? []} value={(field.value as string) ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={f.placeholder ?? "Select"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(f.options ?? []).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input {...field} value={(field.value as string) ?? ""} placeholder={f.placeholder} />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          {form.formState.errors.root && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
