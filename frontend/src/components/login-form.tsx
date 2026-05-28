"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  clearSession,
  login,
  rolesAcceptedForToggle,
  saveSession,
} from "@/lib/auth";

type Toggle = "STUDENT" | "PROFESSOR";

export function LoginForm() {
  const router = useRouter();
  const [toggle, setToggle] = useState<Toggle>("STUDENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = toggle === "PROFESSOR" ? "bg-accent-yellow" : "bg-accent-orange";
  const placeholder =
    toggle === "PROFESSOR"
      ? "tu.email.profesor@univ.edu"
      : "tu.email.estudiante@univ.edu";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await login(email, password);
      const accepted = rolesAcceptedForToggle(toggle);
      if (!accepted.includes(session.user.role)) {
        clearSession();
        throw new Error(
          toggle === "PROFESSOR"
            ? "Este email no corresponde a un profesor."
            : "Este email no corresponde a un estudiante.",
        );
      }
      saveSession(session);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]"
    >
      <h2 className="text-2xl font-medium tracking-tight">Iniciar sesión</h2>

      <div
        className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-border bg-foreground/[0.04] p-1"
        role="tablist"
        aria-label="Seleccionar rol"
      >
        <ToggleButton
          active={toggle === "STUDENT"}
          activeClass="bg-accent-orange text-background"
          onClick={() => setToggle("STUDENT")}
        >
          Estudiante
        </ToggleButton>
        <ToggleButton
          active={toggle === "PROFESSOR"}
          activeClass="bg-accent-yellow text-background"
          onClick={() => setToggle("PROFESSOR")}
        >
          Profesor
        </ToggleButton>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder={placeholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="mt-2 w-full rounded-lg border border-border bg-foreground/[0.04] px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-accent-orange/60 disabled:opacity-50"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="mt-2 w-full rounded-lg border border-border bg-foreground/[0.04] px-3 py-2.5 text-sm font-mono text-foreground outline-none transition-colors placeholder:text-muted/60 placeholder:font-sans focus:border-accent-orange/60 disabled:opacity-50"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className={cn(
          "mt-6 w-full rounded-full px-4 py-2.5 text-sm font-medium text-background transition-transform",
          accent,
          loading ? "opacity-60" : "hover:scale-[1.01]",
        )}
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-status-wrong/40 bg-status-wrong/10 px-3 py-2 text-sm text-status-wrong"
        >
          {error}
        </p>
      )}
    </form>
  );
}

function ToggleButton({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-2 text-sm font-medium transition-colors",
        active
          ? activeClass
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
