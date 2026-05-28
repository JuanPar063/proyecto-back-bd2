import { apiFetch } from "./api";

export type Role = "ADMIN" | "PROFESSOR" | "STUDENT";

export interface SessionUser {
  id: string;
  email: string;
  /**
   * El backend de /auth/login y /auth/me actualmente sólo devuelve
   * { id, email, role }. fullName es opcional y se deriva del email si falta.
   */
  fullName?: string;
  role: Role;
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  user: SessionUser;
}

const STORAGE_KEY = "sqljudge_session";

export async function login(
  email: string,
  password: string,
): Promise<Session> {
  return apiFetch<Session>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function saveSession(s: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Roles aceptables según lo que el toggle del login indique. */
export function rolesAcceptedForToggle(
  toggle: "STUDENT" | "PROFESSOR",
): Role[] {
  return toggle === "PROFESSOR" ? ["PROFESSOR", "ADMIN"] : ["STUDENT"];
}

/**
 * Deriva un nombre legible del email cuando el backend no devuelve fullName.
 * "ana.estudiante@univ.edu" → "Ana"
 * "carlos.profe@univ.edu"  → "Carlos"
 * "admin@sqljudge.local"   → "Admin"
 */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "user";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** Helper conveniente: devuelve fullName si existe; si no, derivado del email. */
export function displayName(user: SessionUser): string {
  return user.fullName ?? nameFromEmail(user.email);
}
