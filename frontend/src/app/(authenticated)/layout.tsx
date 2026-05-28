"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSession, type Session } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { Sidebar } from "@/components/sidebar";

/**
 * Layout app-like para todas las rutas autenticadas.
 * - Sin shader (lo guarda exclusivo del landing).
 * - Topbar fijo + sidebar fija a la izquierda.
 * - El contenido principal scrollea independiente y mantiene
 *   los items de la sidebar siempre visibles.
 */
export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
    setReady(true);
  }, [router]);

  if (!ready || !session) return null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Topbar session={session} />
      <div className="flex">
        <Sidebar role={session.user.role} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
