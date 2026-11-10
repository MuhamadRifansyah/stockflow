export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T) => React.ReactNode;
};

/** Plain accessible table with capped uppercase headers — the app's primary element. */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyText = "Belum ada data.",
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted ${
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-3 align-top ${
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
