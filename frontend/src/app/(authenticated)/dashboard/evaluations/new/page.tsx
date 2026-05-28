"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard/bits";

export default function NewEvaluationPage() {
  return (
    <div className="px-6 py-8 md:px-10">
      <Link
        href="/dashboard/evaluations"
        className="mb-4 inline-flex text-xs text-muted-foreground hover:text-foreground"
      >
        ← Evaluaciones
      </Link>

      <PageHeader
        title="Nueva evaluación"
        subtitle="Crear un parcial (próximamente)."
      />
      <div className="mt-8 rounded-xl border border-dashed border-border/70 bg-foreground/[0.02] px-5 py-10 text-sm text-muted-foreground">
        El form va a recoger nombre, curso, fecha inicio/fin, duración y
        máximo de intentos. Luego abre la asignación de retos vía{" "}
        <code className="font-mono text-foreground/80">PATCH /api/evaluations/:id/challenges</code>.
      </div>
    </div>
  );
}
