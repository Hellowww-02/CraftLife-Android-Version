/**
 * M15b — klien Supabase minimal (PostgREST + GoTrue) berbasis fetch.
 *
 * Sengaja tanpa dependensi baru: yang dibutuhkan hanya REST. Kredensial =
 * URL proyek + anon key (publik by-design, dijaga RLS — jangan pernah taruh
 * service_role di aplikasi). Dibaca dari env build:
 *   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 */

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function cloudConfig(): CloudConfig | null {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined) ?? "";
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? "";
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ""), anonKey };
}

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setCloudSession(access: string | null, refresh: string | null): void {
  accessToken = access;
  refreshToken = refresh;
}
export function cloudAccessToken(): string | null {
  return accessToken;
}
export function hasCloudSession(): boolean {
  return accessToken !== null;
}

/** PostgREST: GET /rest/v1/<path> (query PostgREST apa adanya). */
export async function restGet<T>(path: string): Promise<T> {
  const cfg = cloudConfig();
  if (!cfg) throw new Error("cloud_not_configured");
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${accessToken ?? cfg.anonKey}`,
    },
  });
  if (!res.ok) throw new Error(`cloud_rest_${res.status}`);
  return (await res.json()) as T;
}

/** RPC: POST /rest/v1/rpc/<fn> */
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const cfg = cloudConfig();
  if (!cfg) throw new Error("cloud_not_configured");
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${accessToken ?? cfg.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`cloud_rpc_${res.status}:${text.slice(0, 120)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** GoTrue: login email/password → sesi. */
export async function signIn(email: string, password: string): Promise<boolean> {
  const cfg = cloudConfig();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) return false;
  setCloudSession(data.access_token, data.refresh_token ?? null);
  return true;
}

/** GoTrue: daftar akun baru (langsung login bila langsung dikonfirmasi). */
export async function signUp(email: string, password: string): Promise<boolean> {
  const cfg = cloudConfig();
  if (!cfg) return false;
  const res = await fetch(`${cfg.url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (data.access_token) setCloudSession(data.access_token, data.refresh_token ?? null);
  return true;
}

export function signOut(): void {
  setCloudSession(null, null);
}
