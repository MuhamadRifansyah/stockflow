# StockFlow — Inventory & Asset Management System

StockFlow is a production-quality inventory and asset management web application for companies, warehouses, offices, and operational teams. It covers inventory, stock in/out, asset tracking and assignment, warehouses and locations, stock requests and approvals, stock opname, suppliers, reports and analytics, user management with role-based permissions, audit logs, and notifications.

> **Status:** built in 8 phases and working. The interface is in Bahasa Indonesia, monetary values use IDR, and dates/numbers use the `id-ID` locale.

## Screenshots

![Login](docs/screenshots/01-login.png)
![Dashboard](docs/screenshots/02-dashboard.png)
![Semua Item](docs/screenshots/03-semua-item.png)
![Kategori](docs/screenshots/04-kategori.png)
![Lokasi](docs/screenshots/05-lokasi.png)
![Pergerakan Stok](docs/screenshots/06-pergerakan-stok.png)
![Registri Aset](docs/screenshots/07-registri-aset.png)
![Penugasan Aset](docs/screenshots/08-penugasan-aset.png)
![Permintaan Stok](docs/screenshots/09-permintaan-stok.png)
![Detail Persetujuan](docs/screenshots/10-persetujuan-detail.png)
![Persetujuan](docs/screenshots/11-persetujuan.png)
![Stok Opname](docs/screenshots/12-stok-opname.png)
![Pemasok](docs/screenshots/13-pemasok.png)
![Laporan & Analitik](docs/screenshots/14-laporan-analitik.png)
![Log Audit](docs/screenshots/15-log-audit.png)
![Manajemen Pengguna](docs/screenshots/16-manajemen-pengguna.png)
![Pengaturan](docs/screenshots/17-pengaturan.png)

## Modules

| Module | What it does |
|---|---|
| Dashboard | Executive overview: units available, inventory value, low-stock items, active assets, 6-month movement trend, distribution by category, items requiring attention |
| All Items | Inventory table (SKU, name, category, location, stock, minimum stock, unit, status, last updated) with search, sorting, pagination, filters, add/edit/delete, item detail with stock history |
| Categories & Locations | CRUD; deletes blocked while still referenced |
| Suppliers | Profiles, associated items, purchase history, record-purchase flow that posts a matching stock-in movement |
| Stock Movement | Stock In, Stock Out, Transfer, Adjustment — every transaction records ID, item, quantity, type, source/destination locations, date, creator, notes |
| Asset Registry | Laptops, monitors, printers, furniture, networking equipment — serial number, purchase date/price, condition, location, status |
| Asset Assignments | Assign, return (with condition), maintenance start/end, permanent assignment history |
| Stock Requests | Employee creates → Manager approves/rejects → Warehouse Staff processes → completion posts real stock-out movements |
| Stock Opname | Sessions snapshot per-location balances, physical counts, live discrepancies; balances change only on manager approval |
| Reports & Analytics | 7 live reports (current inventory, low stock, movements, asset register, asset assignments, valuation, opname discrepancies) with date/category/location filters; Excel (`.xls`) and PDF export |
| Audit Logs | User, action, module, entity ID, previous/new values, timestamp — with filters and before/after detail |
| Notifications | In-app center fed by low-stock, request, and opname events |
| User Management | 5 roles, 27-permission catalog, per-role permission matrix editor |
| Settings & Documentation | Account, permissions, change password, in-app README and operations guide |

## Roles & permissions

| Role | Permissions |
|---|---|
| Super Admin | All 27 (role locked) |
| Admin | 26 (all except role management) |
| Warehouse Staff | 16 |
| Manager | 12 |
| Employee | 5 |

Permissions are enforced server-side on every operation, not just by hiding menu items.

## Core data invariants

- **Stock balances are derived, never edited.** Every change flows through the `StockMovement` ledger inside a database transaction; balances are recomputed from it.
- **Negative stock is impossible.** Validation rejects over-issue, over-transfer, same-location transfers, zero adjustments, and any result below zero.
- **Opname adjustments require approval.** Physical counts only change balances after a manager approves the session.
- **Everything important is audited.** All mutations write an audit log entry.

## Design

Premium enterprise SaaS direction: minimalist, editorial typography (Inter), generous whitespace, subtle borders, restrained shadows. Background `#F8F8F6`, sidebar `#17191C`, accent `#236B50`, text `#202522` / `#737A75`, border `#E6E8E5`. No gradients, no decorative illustrations, no emoji icons (Lucide throughout). Tables, filters, drawers, and forms are the primary interface elements.

## Tech notes

StockFlow was built as a full-stack web application on Muse's hosted runtime (relational database + typed server actions), following the architecture of the specified stack — Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL/Prisma data model, Auth.js-style sessions, shadcn/ui-style components, Recharts-style analytics, TanStack Table-style data tables — adapted to the hosted runtime. The data model, RBAC, and ledger invariants mirror the specified Prisma schema (UUID keys, `createdAt`/`updatedAt`, foreign keys, unique SKU, per-location `StockBalance`).

Security: PBKDF2 password hashing (120k iterations), server-side session tokens (7 days), brute-force login throttling (8 failures per email → 15-minute lockout), magic-byte verification on product image uploads (2 MB limit), no secrets in frontend code, no published demo credentials.

## First run

1. Open the app — the first visit shows a one-time setup screen to create the **Super Admin** account with a password you choose.
2. Sign in as Super Admin and open **User Management** to activate the four seeded demo accounts (Admin, Manager, Warehouse Staff, Employee) and set their passwords. Demo accounts are seeded inactive with discarded random passwords.
3. Demo data (14 SKUs, 18 movements, 8 assets, 3 locations, 3 suppliers) is seeded once when the database is empty and never overwrites existing data.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, invariants, RBAC
- [`docs/SETUP.md`](docs/SETUP.md) — setup, demo accounts, daily operations
- [`.env.example`](.env.example) — configuration values (the hosted build needs no environment variables; the file documents the effective built-in values)

## Build phases

1. App shell, design system, dashboard · 2. Schema, auth, RBAC · 3. Inventory, categories, locations, suppliers · 4. Stock movements & balance ledger · 5. Assets, requests & approvals, opname · 6. Reports, exports, notifications, audit logs · 7. Testing, security review, performance, responsive refinement · 8. Documentation & packaging — plus a senior product-design review pass over the whole UI.
