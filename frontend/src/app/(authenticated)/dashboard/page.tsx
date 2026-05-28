"use client";

import { useEffect, useState } from "react";
import { loadSession, type Session } from "@/lib/auth";
import { OverviewStudent } from "@/components/dashboard/overview-student";
import { OverviewProfessor } from "@/components/dashboard/overview-professor";

export default function DashboardOverviewPage() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  if (!session) return null;

  return (
    <div className="px-6 py-8 md:px-10">
      {session.user.role === "STUDENT" ? (
        <OverviewStudent session={session} />
      ) : (
        <OverviewProfessor session={session} />
      )}
    </div>
  );
}
