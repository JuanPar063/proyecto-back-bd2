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

interface Course {
  id: string;
  code: string;
  name: string;
  period: string;
  groupName?: string;
  professorId: string;
}

export default function CoursesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    setSession(s);
    apiFetch<Course[]>("/courses", { token: s.accessToken })
      .then(setCourses)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!session) return null;

  const canCreate = session.user.role === "PROFESSOR" || session.user.role === "ADMIN";
  const subtitle =
    session.user.role === "STUDENT"
      ? "Cursos donde estás inscrito."
      : "Cursos que enseñas.";

  return (
    <div className="px-6 py-8 md:px-10">
      <PageHeader
        title="Cursos"
        subtitle={subtitle}
        action={
          canCreate ? (
            <PrimaryButton href="/dashboard/courses/new" variant="orange">
              + Crear curso
            </PrimaryButton>
          ) : null
        }
      />

      <div className="mt-8">
        {error ? (
          <ErrorBox message={error} />
        ) : courses === null ? (
          <DashboardSkeleton />
        ) : courses.length === 0 ? (
          <Empty>
            {canCreate
              ? "No tenés cursos creados. Empezá creando uno con el botón de arriba."
              : "No estás inscrito en ningún curso todavía."}
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/courses/${c.id}`}
                className="rounded-xl border border-border bg-foreground/[0.03] p-5 transition-colors hover:border-accent-orange/60"
              >
                <div className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {c.code}
                </div>
                <h3 className="mt-1 text-lg tracking-tight">{c.name}</h3>
                <p className="mt-3 text-xs text-muted-foreground">
                  Período {c.period}
                  {c.groupName ? ` · Grupo ${c.groupName}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
