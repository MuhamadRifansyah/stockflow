"use client";

import { useState } from "react";

type ActionResult = { ok: boolean; error?: string };

/**
 * Confirmation dialog. `action` is a server action passed as a prop and
 * `actionId` is the record it acts on — closures cannot cross the
 * server/client boundary, so the id is passed separately.
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  danger = false,
  action,
  actionId,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  action: (id: string) => Promise<ActionResult>;
  actionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    const res = await action(actionId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Gagal memproses.");
      return;
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-md px-3 py-1.5 text-sm ${
          danger
            ? "border border-danger/40 text-danger hover:bg-red-50"
            : "border border-line bg-white hover:border-accent"
        }`}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="w-full max-w-md rounded-md bg-white p-6">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{description}</p>
            {error && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-line px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  danger ? "bg-danger" : "bg-accent hover:bg-accent-dark"
                }`}
              >
                {busy ? "Memproses…" : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
