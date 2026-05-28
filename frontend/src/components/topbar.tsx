"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearSession, displayName, type Session } from "@/lib/auth";

export function Topbar({ session }: { session: Session }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 h-14 border-b border-border bg-background">
      <div className="relative flex h-full items-center justify-between px-6 md:px-8">
        <Link
          href="/dashboard"
          className="text-sm font-medium uppercase tracking-[0.22em] text-foreground/90"
        >
          SQL <span className="text-accent-orange">Judge</span>
        </Link>

        <div className="flex items-center gap-4 text-xs">
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-foreground/90">
              {displayName(session.user)}
            </span>
            <span className="font-mono uppercase tracking-widest text-muted">
              {session.user.role}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace("/");
            }}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-accent-orange/60 hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </div>

        {/* línea de acento que reemplaza la presencia del shader */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-accent-orange/0 via-accent-orange/40 to-accent-yellow/0" />
      </div>
    </header>
  );
}
