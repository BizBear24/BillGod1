"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Confirmation for voiding a finalised sale or purchase. Voiding is
 * destructive enough to be worth typing a reason for — the reason is stored
 * on the document and shown against it afterwards.
 */
export function CancelDocDialog({
  docNumber,
  open,
  busy,
  description,
  onClose,
  onConfirm,
}: {
  docNumber: string | null;
  open: boolean;
  busy: boolean;
  description: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {docNumber}?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. billed to the wrong customer)" />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep document
          </Button>
          <Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => onConfirm(reason)}>
            {busy ? "Cancelling…" : "Cancel document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
