/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The generated database types are still empty, which makes every
 * `.from("table")` call resolve to `never`. Until the schema types exist,
 * queries go through this loosely typed view of the client.
 */
export type LooseClient = SupabaseClient<any, "public", any>;

export function loose(client: unknown): LooseClient {
  return client as unknown as LooseClient;
}
