/**
 * Portable service-role Supabase client.
 *
 * The generated `client.server.ts` is regenerated whenever a project is moved
 * to another account, so the project keeps its own resolver here. It accepts
 * every naming convention this project has used for the backend admin key
 * (`SUPABASE_SERVICE_ROLE_KEY`, `CASEFORGE_BACKEND_ADMIN_KEY`, …) and derives
 * the project URL from whatever variable happens to be present.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const KEY_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CASEFORGE_BACKEND_ADMIN_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_KEY",
] as const;

const URL_NAMES = ["SUPABASE_URL", "VITE_SUPABASE_URL"] as const;

// Last-resort defaults so the project keeps working when no env vars are set.
const FALLBACK_URL = "https://hpbjxknfyexhfwktnpyb.supabase.co";
const FALLBACK_KEY = "sb_secret_ORZbPM6hg5zerYpsyDuS7g_N8gz2oX1";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export function resolveAdminCredentials(): {
  url: string | undefined;
  key: string | undefined;
  missing: string[];
} {
  let url = URL_NAMES.map(env).find(Boolean);
  if (!url) {
    const projectId = env("SUPABASE_PROJECT_ID") ?? env("VITE_SUPABASE_PROJECT_ID");
    if (projectId) url = `https://${projectId}.supabase.co`;
  }
  const key = KEY_NAMES.map(env).find(Boolean) ?? FALLBACK_KEY;
  url = url ?? FALLBACK_URL;
  const missing = [...(url ? [] : ["SUPABASE_URL"]), ...(key ? [] : ["SUPABASE_SERVICE_ROLE_KEY"])];
  return { url, key, missing };
}

function isOpaqueKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let cached: SupabaseClient<any, "public", any> | undefined;

/** Throws a readable error when the backend key is missing or empty. */
export function getAdminClient(): SupabaseClient<any, "public", any> {
  if (cached) return cached;
  const { url, key, missing } = resolveAdminCredentials();
  if (!url || !key) {
    throw new Error(
      `Backend is not configured: missing ${missing.join(", ")}. Add the service role key in project settings.`,
    );
  }

  cached = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
        );
        if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        // New-format keys are opaque strings, not bearer JWTs.
        if (isOpaqueKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return cached;
}
