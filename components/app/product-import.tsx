"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileDown, AlertTriangle, CheckCircle2, History, Undo2 } from "lucide-react";
import {
  previewProductImport,
  commitProductImport,
  getProductImportTemplate,
  listRecentImportBatches,
  undoProductImportBatch,
  type ImportPreview,
} from "@/app/actions/product-import";
import { getFilesystemService, base64ToBytes } from "@/lib/fs";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";


function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    // readAsDataURL gives "data:...;base64,XXXX" — keep only the payload.
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

/** 8 MB is well past any realistic catalogue and keeps the server action honest. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Bulk product import.
 *
 * Always previews first: the file is parsed and checked, and the user sees
 * exactly how many products would be created, how many updated and what the
 * importer could not make sense of, before anything is written.
 */
type ImportBatch = Awaited<ReturnType<typeof listRecentImportBatches>>[number];

export function ProductImport({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [createMissingMasters, setCreateMissingMasters] = React.useState(true);
  const [busy, setBusy] = React.useState<"idle" | "template" | "preview" | "commit">("idle");
  const [batches, setBatches] = React.useState<ImportBatch[] | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);

  const loadBatches = React.useCallback(async () => {
    try {
      setBatches(await listRecentImportBatches());
    } catch {
      // Recent-imports history is a convenience, not required for importing — fail quietly.
    }
  }, []);

  React.useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void listRecentImportBatches().then((result) => {
      if (!cancelled) setBatches(result);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  async function handleUndo(batch: ImportBatch) {
    if (
      !confirm(
        `Undo "${batch.fileName}"? This permanently deletes the ${batch.remaining} product${batch.remaining === 1 ? "" : "s"} it created. Products it only updated are not touched.`
      )
    )
      return;
    setUndoingId(batch.id);
    try {
      const result = await undoProductImportBatch(batch.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Removed ${result.deleted} product${result.deleted === 1 ? "" : "s"}${result.blocked > 0 ? ` — ${result.blocked} couldn't be removed because they're already used in a sale, purchase or stock record.` : "."}`
      );
      await loadBatches();
      router.refresh();
    } finally {
      setUndoingId(null);
    }
  }

  if (!canManage) return null;

  function reset() {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(picked: File) {
    if (picked.size > MAX_BYTES) {
      toast.error("That file is larger than 8 MB — split it into a few smaller files.");
      return;
    }
    setFile(picked);
    setPreview(null);
    setBusy("preview");
    try {
      const result = await previewProductImport(await toBase64(picked), picked.name, { createMissingMasters });
      if (!result.ok) {
        toast.error(result.error);
        reset();
        return;
      }
      setPreview(result);
    } catch {
      toast.error("Could not read that file.");
      reset();
    } finally {
      setBusy("idle");
    }
  }

  async function handleCommit() {
    if (!file) return;
    setBusy("commit");
    try {
      const result = await commitProductImport(await toBase64(file), file.name, { createMissingMasters });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Imported — ${result.created} new, ${result.updated} updated${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.` +
          (result.batchId ? " You can undo the new products from Recent Imports below if anything looks wrong." : "")
      );
      reset();
      await loadBatches();
      router.refresh();
    } finally {
      setBusy("idle");
    }
  }

  const importable = preview ? preview.rows.length : 0;

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold leading-tight">Import from Excel or CSV</h2>
              <p className="text-xs text-muted-foreground">
                Rows are matched on Item Code — an existing code updates that product, a new one adds it.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== "idle"}
              onClick={async () => {
                setBusy("template");
                const result = await getProductImportTemplate();
                setBusy("idle");
                if (!result.ok || !result.base64) {
                  toast.error(result.ok ? "Could not build the template." : result.error);
                  return;
                }
                await getFilesystemService().saveFile("billgod-product-import-template.xlsx", base64ToBytes(result.base64), XLSX_MIME);
              }}
            >
              <FileDown className="h-3.5 w-3.5" />
              {busy === "template" ? "Building…" : "Download template"}
            </Button>
            <Button size="sm" disabled={busy !== "idle"} onClick={() => inputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {busy === "preview" ? "Reading…" : "Choose file"}
            </Button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void handleFile(picked);
          }}
        />

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={createMissingMasters}
            onChange={(e) => setCreateMissingMasters(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
          Create categories, brands and units that don&apos;t exist yet
        </label>

        {preview && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{file?.name}</Badge>
              <Badge variant="secondary">Sheet: {preview.sheetName}</Badge>
              <Badge variant="secondary">{preview.creates} to add</Badge>
              <Badge variant="secondary">{preview.updates} to update</Badge>
              {preview.errors.length > 0 && <Badge variant="destructive">{preview.errors.length} row(s) will be skipped</Badge>}
            </div>

            {preview.unknownHeadings.length > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Ignored column(s): {preview.unknownHeadings.join(", ")}
              </p>
            )}

            {preview.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Rows that will be skipped</p>
                <ul className="space-y-0.5 text-xs text-destructive">
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      Row {e.row} — {e.message}
                    </li>
                  ))}
                  {preview.errors.length > 10 && <li>…and {preview.errors.length - 10} more.</li>}
                </ul>
              </div>
            )}

            {importable > 0 && (
              <div className="max-h-72 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-24">Action</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.slice(0, 100).map((r) => (
                      <TableRow key={r.row}>
                        <TableCell className="text-muted-foreground">{r.row}</TableCell>
                        <TableCell className="font-medium">{r.itemCode}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>
                          <Badge variant={r.action === "create" ? "secondary" : "outline"}>
                            {r.action === "create" ? "Add" : "Update"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.warnings.join(" ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {preview.rows.length > 100 && (
              <p className="text-xs text-muted-foreground">Showing the first 100 rows; all {preview.rows.length} will be imported.</p>
            )}

            {importable > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
                Double-check this list before importing. New products can be undone from Recent Imports below if this turns out to be the
                wrong file — but products it only updates get overwritten in place, and that part can&apos;t be automatically reverted.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button disabled={busy !== "idle" || importable === 0} onClick={handleCommit}>
                <CheckCircle2 className="h-4 w-4" />
                {busy === "commit" ? "Importing…" : `Import ${importable} product${importable === 1 ? "" : "s"}`}
              </Button>
              <Button variant="ghost" disabled={busy !== "idle"} onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {batches && batches.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Recent imports</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="w-20">Created</TableHead>
                    <TableHead className="w-20">Updated</TableHead>
                    <TableHead className="w-20">Skipped</TableHead>
                    <TableHead className="w-40" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.fileName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</TableCell>
                      <TableCell>{b.createdCount}</TableCell>
                      <TableCell>{b.updatedCount}</TableCell>
                      <TableCell>{b.skippedCount}</TableCell>
                      <TableCell className="text-right">
                        {b.remaining > 0 ? (
                          <Button variant="ghost" size="sm" disabled={undoingId === b.id} onClick={() => void handleUndo(b)}>
                            <Undo2 className="h-3.5 w-3.5 text-destructive" />
                            {undoingId === b.id ? "Undoing…" : `Undo (${b.remaining})`}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {b.createdCount > 0 ? "Already undone" : "Nothing to undo"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              &quot;Undo&quot; deletes only the products that import created. A product already used in a sale, purchase or stock record
              can&apos;t be deleted and is left in place.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
