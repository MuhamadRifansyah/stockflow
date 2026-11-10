"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideRequest } from "@/lib/actions/requests";

export function ApprovalDialog({
  requestId,
  code,
  requester,
  purpose,
  createdAt,
  items,
}: {
  requestId: string;
  code: string;
  requester: string;
  purpose: string;
  createdAt: string;
  items: { name: string; sku: string; qty: number; stock: number; unit: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await decideRequest(requestId, decision, note || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:border-accent"
      >
        Putuskan
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Permintaan ${code}`}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md bg-white p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold">Permintaan {code}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup" className="rounded-md px-2 py-1 text-muted hover:bg-canvas">✕</button>
            </div>
            <p className="mt-2 text-sm">
              <strong>{requester}</strong> · <span className="text-amber">Menunggu</span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted">Tujuan</dt>
                <dd className="mt-0.5">{purpose}</dd>
              </div>
              <div>
                <dt className="text-muted">Dibuat</dt>
                <dd className="mt-0.5">{createdAt}</dd>
              </div>
              <div>
                <dt className="text-muted">Lokasi Sumber</dt>
                <dd className="mt-0.5">—</dd>
              </div>
            </dl>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2 text-[11px] font-medium uppercase tracking-wider text-muted">Item</th>
                  <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Diminta</th>
                  <th scope="col" className="py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Stok Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.sku} className="border-b border-line last:border-0">
                    <td className="py-2.5">
                      {it.name}
                      <span className="block text-xs text-muted">{it.sku}</span>
                    </td>
                    <td className="py-2.5 text-right">{it.qty} {it.unit}</td>
                    <td className="py-2.5 text-right">{it.stock} {it.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 rounded-md bg-canvas p-4">
              <h3 className="font-medium">Keputusan Persetujuan</h3>
              <label htmlFor={`note-${requestId}`} className="mt-3 block text-sm text-muted">Catatan (opsional)</label>
              <input
                id={`note-${requestId}`}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Alasan persetujuan atau penolakan…"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              />
              {error && (
                <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide("approve")}
                  disabled={busy}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
                >
                  ✓ Setujui Permintaan
                </button>
                <button
                  type="button"
                  onClick={() => decide("reject")}
                  disabled={busy}
                  className="rounded-md border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-red-50 disabled:opacity-60"
                >
                  ✕ Tolak
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
