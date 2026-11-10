"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMovement } from "@/lib/actions/movements";

type Option = { id: string; label: string };

const TYPES = [
  { value: "MASUK", label: "Masuk" },
  { value: "KELUAR", label: "Keluar" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "PENYESUAIAN", label: "Penyesuaian" },
] as const;

export function MovementForm({
  items,
  locations,
}: {
  items: Option[];
  locations: Option[];
}) {
  const router = useRouter();
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("MASUK");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await createMovement(new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/movements");
    router.refresh();
  }

  const needsFrom = type === "KELUAR" || type === "TRANSFER";
  const needsTo = type !== "KELUAR";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-line bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="itemId" className="block text-sm font-medium mb-1">Item</label>
          <select id="itemId" name="itemId" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
            <option value="">Pilih item…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-medium mb-1">Jenis</label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quantity" className="block text-sm font-medium mb-1">
            Jumlah {type === "PENYESUAIAN" ? "(boleh negatif, mis. -1)" : ""}
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            step="1"
            required
            placeholder={type === "PENYESUAIAN" ? "mis. -1 atau 2" : "mis. 10"}
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          />
        </div>
        {needsFrom && (
          <div>
            <label htmlFor="fromLocationId" className="block text-sm font-medium mb-1">Lokasi sumber</label>
            <select id="fromLocationId" name="fromLocationId" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Pilih lokasi…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        )}
        {needsTo && (
          <div>
            <label htmlFor="toLocationId" className="block text-sm font-medium mb-1">
              {type === "TRANSFER" ? "Lokasi tujuan" : "Lokasi"}
            </label>
            <select id="toLocationId" name="toLocationId" required className="w-full rounded-md border border-line px-3 py-2 text-sm">
              <option value="">Pilih lokasi…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="note" className="block text-sm font-medium mb-1">Catatan (opsional)</label>
          <input
            id="note"
            name="note"
            type="text"
            maxLength={500}
            placeholder="mis. Restok dari pemasok"
            className="w-full rounded-md border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      <p className="text-xs text-muted">
        Stok keluar / transfer yang melebihi saldo akan ditolak. Saldo tidak pernah
        bisa negatif — semua perubahan tercatat di riwayat.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Menyimpan…" : "Catat Transaksi"}
      </button>
    </form>
  );
}
