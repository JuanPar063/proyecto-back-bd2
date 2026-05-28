"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { loadSession, type Session } from "@/lib/auth";
import {
  DashboardSkeleton,
  Empty,
  ErrorBox,
  PageHeader,
  PrimaryButton,
} from "@/components/dashboard/bits";
import { cn } from "@/lib/utils";

interface Evaluation {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  maxAttempts: number;
}

export default function EvaluationsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);
    apiFetch<Evaluation[]>("/evaluations", { token: s.accessToken })
      .then(setEvaluations)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!session) return null;
  const canCreate = session.user.role === "PROFESSOR" || session.user.role === "ADMIN";

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Evaluaciones"
        subtitle={
          session.user.role === "STUDENT"
            ? "Parciales en tus cursos."
            : "Parciales que creaste."
        }
        action={
          canCreate ? (
            <PrimaryButton href="/dashboard/evaluations/new" variant="orange">
              + Crear evaluación
            </PrimaryButton>
          ) : null
        }
      />

      <div className="mt-8">
        {error ? (
          <ErrorBox message={error} />
        ) : evaluations === null ? (
          <DashboardSkeleton />
        ) : evaluations.length === 0 ? (
          <Empty>No hay evaluaciones por ahora.</Empty>
        ) : (
          <div className="grid gap-3">
            {evaluations.map((e) => {
              const now = Date.now();
              const start = new Date(e.startDate).getTime();
              const end = new Date(e.endDate).getTime();
              const active = now >= start && now <= end;
              return (
                <Link
                  key={e.id}
                  href={`/dashboard/evaluations/${e.id}`}
                  className="rounded-xl border border-border bg-foreground/[0.03] px-5 py-4 transition-colors hover:border-accent-orange/60"
                >
                  <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        active ? "bg-accent-orange" : "bg-muted",
                      )}
                    />
                    {active ? "Activa" : "Cerrada"}
                  </div>
                  <h3 className="mt-2 text-lg">{e.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.durationMinutes} min · {e.maxAttempts} intento(s)
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
