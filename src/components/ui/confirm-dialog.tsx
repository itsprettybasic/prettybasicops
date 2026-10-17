"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Lanjutkan",
  tone = "primary",
  requireReason,
  reasonLabel = "Alasan",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "neg";
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason("");
        onOpenChange(o);
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Batal</Button>
          <Button
            variant={tone === "neg" ? "neg" : "primary"}
            loading={busy}
            disabled={requireReason && !reason.trim()}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-ink-2">{message}</div>
      {requireReason && (
        <div className="mt-4">
          <label className="form-label">{reasonLabel}</label>
          <textarea
            autoFocus
            className="form-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Wajib diisi"
          />
        </div>
      )}
    </Modal>
  );
}
