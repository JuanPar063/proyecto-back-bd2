"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import { ErrorBox, PageHeader } from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface CreatedCourse {
  id: string;
  code: string;
  name: string;
}

export default function NewCoursePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [period, setPeriod] = useState("2026-1");
  const [group, setGroup] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    if (s.user.role !== "PROFESSOR" && s.user.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setSession(s);
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<CreatedCourse>("/courses", {
        method: "POST",
        token: session.accessToken,
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim(),
          period: period.trim(),
          group: group.trim(),
        }),
      });
      router.push(`/dashboard/courses?created=${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/courses"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Cursos
      </Link>

      <PageHeader
        title="Nuevo curso"
        subtitle="Solo el profesor del curso podrá crear retos, evaluaciones e inscribir estudiantes."
      />

      <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-5">
        <Field label="Nombre del curso" hint="Ej. Bases de Datos II">
          <input
            type="text"
            required
            minLength={3}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bases de Datos II"
            disabled={loading}
            className={inputCls}
          />
        </Field>

        <Field
          label="Código"
          hint="Identificador único en todo el sistema. No se puede repetir."
        >
          <input
            type="text"
            required
            minLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BD2-2026-1"
            disabled={loading}
            className={cn(inputCls, "font-mono uppercase")}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Período" hint="Año-semestre">
            <input
              type="text"
              required
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="2026-1"
              disabled={loading}
              className={inputCls}
            />
          </Field>

          <Field label="Grupo">
            <input
              type="text"
              required
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="1"
              disabled={loading}
              className={inputCls}
            />
          </Field>
        </div>

        {error && <ErrorBox message={error} />}

        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "rounded-full bg-accent-orange px-5 py-2.5 text-sm font-medium text-background transition-transform",
              loading ? "opacity-60" : "hover:scale-[1.02]",
            )}
          >
            {loading ? "Creando..." : "Crear curso"}
          </button>
          <Link
            href="/dashboard/courses"
            className="rounded-full border border-border bg-background px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent-orange/60 hover:text-foreground"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-foreground/[0.03] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-accent-orange/60 disabled:opacity-50";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      {hint && (
        <span className="mt-0.5 block text-xs text-muted">
          {hint}
        </span>
      )}
      <div className="mt-2">{children}</div>
    </label>
  );
}
