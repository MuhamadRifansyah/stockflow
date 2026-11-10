"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { recordCount } from "@/lib/actions/opname";

export type OpnameDetailRow = {
  id: string;
  itemName: string;
  sku: string;
  systemQty: number;
  physicalQty: number | null;
  difference: number;
};

export function OpnameForm({ details }: { details: OpnameDetailRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(details.map((d) => [d.id, d.physicalQty ?? d.systemQty])),
  );
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(detailId: string) {
    setError(null);
    setSavingId(detailId);
    const res = await recordCount(detailId, values[detailId] ?? 0);
    setSavingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">Item</th>
            <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Stok Sistem</th>
            <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Hitung Fisik</th>
            <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Selisih</th>
            <th scope="col" className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d) => {
            const val = values[d.id] ?? d.systemQty;
            const diff = val - d.systemQty;
            return (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{d.itemName}</p>
                  <p className="text-xs text-muted">{d.sku}</p>
                </td>
                <td className="px-4 py-3 text-right">{d.systemQty}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={val}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [d.id]: Number(e.target.value) }))
                    }
                    aria-label={`Hitung fisik ${d.itemName}`}
                    className="w-24 rounded-md border border-line px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className={`px-4 py-3 text-right font-medium ${diff === 0 ? "" : diff > 0 ? "text-accent" : "text-danger"}`}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => save(d.id)}
                    disabled={savingId === d.id}
                    className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent disabled:opacity-60"
                  >
                    {savingId === d.id ? "Menyimpan…" : "Simpan"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error && (
        <p role="alert" className="border-t border-line bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>
      )}
      <p className="border-t border-line px-4 py-3 text-xs text-muted">
        Saldo tidak berubah saat hitungan disimpan — penyesuaian hanya diterapkan setelah
        manajer menyetujui sesi ini.
      </p>
    </div>
  );
}
