import React, { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";

type Status = "checking" | "open" | "login" | "unconfigured";

/**
 * Shows a password screen when the server requires a session (APP_PASSWORD set).
 * Also catches any 401 from the API (expired session) and brings the login back.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkStatus = async () => {
    try {
      const res = await fetch("/api/auth/status");
      const json = await res.json();
      if (!json.configured) setStatus("unconfigured");
      else setStatus(json.authenticated ? "open" : "login");
    } catch {
      setStatus("open"); // server unreachable: let the app show its own offline states
    }
  };

  useEffect(() => {
    checkStatus();
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await originalFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (res.status === 401 && url.includes("/api/") && !url.includes("/api/auth/")) setStatus("login");
      return res;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo iniciar sesión");
      setPassword("");
      setStatus("open");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "open") return <>{children}</>;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 px-4">
      {status === "checking" ? (
        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
      ) : (
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">MetaCloser CRM</h1>
              <p className="text-xs text-slate-500">APM Inox · acceso privado</p>
            </div>
          </div>

          {status === "unconfigured" ? (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              El servidor no tiene contraseña configurada. Agrega <code className="font-bold">APP_PASSWORD</code> en las variables de entorno y reinícialo.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="mc-password" className="text-xs font-bold text-slate-600 block mb-1.5">Contraseña</label>
                <input
                  id="mc-password"
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting || !password}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl py-2.5 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
};
