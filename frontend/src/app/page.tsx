import Link from "next/link";
import { GradientBackground } from "@/components/gradient-background";

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <GradientBackground />

      <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          href="/"
          className="font-display text-2xl tracking-tight text-foreground"
        >
          SQL <span className="text-accent-orange">Judge</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Cómo funciona
          </Link>
          <Link
            href="/login"
            className="transition-colors hover:text-foreground"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-foreground px-4 py-2 text-background transition-colors hover:bg-accent-orange hover:text-foreground"
          >
            Empezar gratis
          </Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-20 text-center md:pt-28">
        <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-orange" />
          Evaluación SQL en sandbox aislado
        </p>

        <h1 className="font-display text-5xl leading-[1.02] tracking-tight text-foreground md:text-7xl lg:text-[5.5rem]">
          Aprende SQL{" "}
          <em className="not-italic text-accent-orange">de verdad</em>.
          <br />
          Sin atajos.
        </h1>

        <p className="mx-auto mt-8 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          Cada consulta corre en un contenedor Postgres efímero. El comparador
          es determinístico, el asistente IA explica tu error y sugiere índices
          reales. Tus profesores ven todo en vivo.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/register"
            className="rounded-full bg-accent-orange px-6 py-3 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
          >
            Crear cuenta de estudiante
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-border bg-background/40 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-background/70"
          >
            Soy profesor
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-5 px-6 pb-32 md:grid-cols-3">
        <Feature
          accent="orange"
          eyebrow="Sandbox aislado"
          title="Cada query, su propio contenedor"
          body="Tu SQL nunca toca la base principal. Un Postgres 16 efímero por submission, con 512 MB de RAM y 0.5 CPU. Cleanup garantizado."
        />
        <Feature
          accent="yellow"
          eyebrow="Comparador determinístico"
          title="Resultados que se comparan en serio"
          body="Multiset de filas, tolerancia decimal, NULLs como valor de primera clase. El veredicto siempre es trazable y reproducible."
        />
        <Feature
          accent="pink"
          eyebrow="Asistente IA"
          title="Recomendaciones útiles, no opiniones"
          body="Índices CREATE INDEX ejecutables, reescritura SQL heurística y sub-scores que entran al puntaje final del estudiante."
        />
      </section>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-xs text-muted-foreground md:flex-row md:items-center">
          <p>
            SQL Judge · Bases de Datos II ·{" "}
            <span className="text-muted">Entregable 2 · 2026-1</span>
          </p>
          <p className="font-mono text-[0.7rem] uppercase tracking-widest">
            NestJS · BullMQ · PostgreSQL 16 · Docker
          </p>
        </div>
      </footer>
    </main>
  );
}

function Feature({
  accent,
  eyebrow,
  title,
  body,
}: {
  accent: "orange" | "yellow" | "pink";
  eyebrow: string;
  title: string;
  body: string;
}) {
  const dot = {
    orange: "bg-accent-orange",
    yellow: "bg-accent-yellow",
    pink: "bg-accent-pink",
  }[accent];

  return (
    <div className="group rounded-2xl border border-border bg-background/40 p-6 backdrop-blur-md transition-colors hover:border-border/80 hover:bg-background/60">
      <div className="mb-4 inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {eyebrow}
      </div>
      <h3 className="font-display text-2xl leading-snug text-foreground">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
