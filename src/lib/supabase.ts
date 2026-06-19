import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!config.supabase.url || !config.supabase.anonKey) {
    return null;
  }

  if (!client) {
    client = createClient(config.supabase.url, config.supabase.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

export async function verifySupabaseApi(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.auth.getSession();
    return !error;
  } catch {
    return false;
  }
}
