"use client";

// STUB — akan diganti implementasi lengkap (Bagian 10 spec).
import { Modal } from "@/components/ui/modal";

export type UploadKind = "masuk" | "keluar" | "master-sku";

export function ExcelUploadModal({
  kind,
  open,
  onOpenChange,
}: {
  kind: UploadKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Upload Excel — ${kind}`}>
      <div />
    </Modal>
  );
}
