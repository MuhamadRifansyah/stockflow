"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRequest } from "@/lib/actions/requests";

type ItemOption = { id: string; label: string };

type Line = { itemId: string; quantity: number };

export function RequestForm({ items }: { items: ItemOption[] }) {
  const router = useRouter();
  const [purpose, setPurpose] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", quantity: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = lines.filter((l) => l.itemId && l.quantity > 0);
    if (clean.length === 0) {
      setError("Tambahkan minimal satu item dengan jumlah yang valid.");
      return;
    }
    setBusy(true);
    const res = await createRequest({ purpose, items: clean });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/requests");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-white p-6">
      <div>
        <label htmlFor="purpose" className="block text-sm font-medium mb-1">Tujuan</label>
        <input
          id="purpose"
          type="text"
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="mis. Kebutuhan operasional harian kantor pusat"
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Item yang diminta</p>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={line.itemId}
                onChange={(e) => setLine(i, { itemId: e.target.value })}
                aria-label={`Item baris ${i + 1}`}
                className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
              >
                <option value="">Pilih item…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.label}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                aria-label={`Jumlah baris ${i + 1}`}
                className="w-24 rounded-md border border-line px-3 py-2 text-sm"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Hapus baris ${i + 1}`}
                  className="rounded-md border border-line px-3 text-sm text-danger"
                >
                  Hapus
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { itemId: "", quantity: 1 }])}
          className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent"
        >
          + Tambah Item
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <p className="text-xs text-muted">
        Permintaan masuk status Menunggu dan harus disetujui manajer sebelum diproses gudang.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Mengirim…" : "Buat Permintaan"}
      </button>
    </form>
  );
}
