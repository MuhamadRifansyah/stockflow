# StockFlow Architecture

## Entities

`User`, `Role`, `Permission`, `RolePermission`, `Session`, `Category`, `Item`,
`Location`, `Supplier`, `Purchase`, `StockBalance`, `StockMovement`, `Asset`,
`AssetAssignment`, `StockRequest`, `StockRequestItem`, `StockOpname`,
`StockOpnameDetail`, `Notification`, `AuditLog`, `LoginAttempt`.

- UUID primary keys; `createdAt` / `updatedAt` where appropriate.
- Foreign keys throughout; indexes on foreign keys and filter columns.
- Unique SKU per item.

## The ledger invariant

`StockBalance` (per item × location) is authoritative but **derived**: it is only
ever changed as part of a `StockMovement` write, in a single atomic database
batch together with the movement row, the item total, the audit entry, and
notifications. There is no direct edit path for balances anywhere in the app —
`updateItem` cannot touch stock.

Movement types: `masuk` (in), `keluar` (out), `transfer`, `penyesuaian`
(adjustment, by signed delta or by physical count with the delta computed
server-side).

Validation on every movement:

- quantity must be positive (adjustments: non-zero delta);
- stock-out / transfer source must have enough balance;
- transfer source and destination must differ;
- result must never go below zero.

The same validation runs in request completion (`completeRequest`) and opname
approval (`decideOpname`), so no workflow can bypass it.

## Requests workflow

States: `menunggu` (Pending) → `disetujui` (Approved) / `ditolak` (Rejected) →
`diproses` (Processing) → `selesai` (Completed).

- Only Manager roles may approve/reject (`requests.approve`).
- Only Warehouse Staff may start processing and complete (`requests.process`).
- Completion posts one real `keluar` movement per line from the chosen source
  location; insufficient stock at the source rejects the whole completion.

## Opname workflow

1. Create a session for one location; the session snapshots current balances.
2. Record physical counts; discrepancies are computed live.
3. Submit for approval.
4. A Manager approves (`opname.approve`) → adjustment movements bring each
   balance exactly to the physical count. Rejection returns the session for
   recount. Balances never change before approval.

## RBAC

27 permissions in the catalog, grouped by module (`items.*`, `movements.*`,
`assets.*`, `requests.*`, `opname.*`, `suppliers.*`, `reports.*`,
`users.*`, `roles.*`, `audit.*`, `settings.*`). Every server action checks the
caller's permission set from the session token; unauthenticated calls are
rejected. The Super Admin role's permission set is locked against edits.

Permission counts: Super Admin 27 · Admin 26 · Warehouse Staff 16 ·
Manager 12 · Employee 5.

## Auth & security

- PBKDF2 password hashing, 120k iterations.
- Server-side session tokens, 7-day TTL.
- Brute-force throttling: 8 failed logins per email → 15-minute lockout
  (`login_attempts` table).
- First-run one-time Super Admin setup; the setup endpoint refuses once a
  Super Admin exists.
- Demo accounts (Admin, Manager, Warehouse Staff, Employee) are seeded
  inactive with random discarded passwords; a Super Admin activates them and
  sets passwords from User Management.
- Product image uploads: 2 MB limit, magic-byte verification (MIME type is
  not trusted).
- No credentials are published anywhere in the app or this repo.

## Exports

- Excel export: SpreadsheetML `.xls` with numeric cells, capped at 5,000 rows,
  gated by `reports.export`, audit-logged.
- PDF export: server-generated PDF, same gating and cap.
