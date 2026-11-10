"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Package } from "lucide-react";

const DEMO_ACCOUNTS = [
  { name: "Admin", email: "admin@stockflow.id" },
  { name: "Manager", email: "manager@stockflow.id" },
  { name: "Warehouse Staff", email: "gudang@stockflow.id" },
  { name: "Employee", email: "karyawan@stockflow.id" },
];

export default function LoginPage() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(
        res.error === "CredentialsSignin"
          ? "Email atau kata sandi salah, atau akun belum aktif."
          : res.error,
      );
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar text-white">
            <Package className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">StockFlow</span>
        </div>

        <h1 className="text-2xl font-semibold">Masuk ke akun Anda</h1>
        <p className="mt-1 text-sm text-muted">
          Gunakan email dan kata sandi yang diberikan administrator.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@perusahaan.id"
              className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Kata sandi</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                className="w-full rounded-md border border-line bg-white px-3 py-2 pr-10 text-sm"
              />
              <button
                type="button"
                aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
          >
            {loading ? "Memeriksa…" : "Masuk"}
          </button>
        </form>

        <div className="mt-6 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setShowDemo((v) => !v)}
            className="text-sm font-medium text-muted"
            aria-expanded={showDemo}
          >
            Akun demo {showDemo ? "▴" : "▾"}
          </button>
          {showDemo && (
            <ul className="mt-3 space-y-2 text-sm">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => setEmail(a.email)}
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-left hover:border-accent"
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="block text-muted">{a.email}</span>
                  </button>
                </li>
              ))}
              <li className="text-xs text-muted">
                Akun demo dibuat nonaktif saat seed — Super Admin harus mengaktifkan dan
                mengatur kata sandinya di Manajemen Pengguna.
              </li>
            </ul>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          StockFlow · Sistem Inventaris &amp; Manajemen Aset
        </p>
      </div>
    </main>
  );
}
