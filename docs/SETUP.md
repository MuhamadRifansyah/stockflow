# StockFlow Setup & Operations

## First run

1. Open the app. The first visit shows a one-time setup screen: create the
   **Super Admin** account with a password you choose. The setup endpoint
   refuses once a Super Admin exists.
2. Sign in as Super Admin → **Manajemen Pengguna**. Activate the four seeded
   demo accounts and set their passwords:
   - Admin — `admin@stockflow.id`
   - Manager — `manager@stockflow.id`
   - Warehouse Staff — `gudang@stockflow.id`
   - Employee — `karyawan@stockflow.id`
3. Demo data (14 SKUs, 18 movements, 8 assets, 3 locations, 3 suppliers) is
   seeded once when the database is empty. It never overwrites existing data.

## Daily operations

- **Record stock in/out:** Pergerakan Stok → new movement. Outbound quantity
  above the available balance is rejected.
- **Process a request:** an Employee creates a request; a Manager approves or
  rejects it; Warehouse Staff processes it from a chosen source location.
  Completion posts the stock-out movements automatically.
- **Run opname:** Stock Opname → new session for a location → record physical
  counts → submit → a Manager approves. Balances change only on approval.
- **Low stock:** the dashboard lists items below minimum stock. Reorder via
  Suppliers → record purchase, which posts the matching stock-in movement.

## When stock goes below minimum

1. Check the item's detail page for its per-location balances and movement
   history.
2. Record a purchase from the supplier (posts stock-in) or transfer stock
   from another location.
3. Never edit balances directly — there is no such path by design; use a
   movement or an approved opname adjustment.

## Roles at a glance

- **Super Admin:** everything, including role management (locked role).
- **Admin:** everything except role management.
- **Warehouse Staff:** inventory, movements, assets, request processing,
  opname counting.
- **Manager:** approvals (requests, opname), reports.
- **Employee:** create stock requests, view own data.

## Configuration

The hosted build needs no environment variables; see [`.env.example`](../.env.example)
for the effective built-in values (session TTL, hashing, throttling, export
and upload limits). For a self-hosted Next.js/Supabase deployment, the same
file shape applies: database URL, auth secret, and storage settings.
