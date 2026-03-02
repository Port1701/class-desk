import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/../../supabase/types.js';
import { getEnvironment } from '@/config/environment.js';

let supabaseClient: SupabaseClient<Database> | null = null;
let supabaseAvailable = false;

export const initSupabase = async () => {
  try {
    const env = getEnvironment();
    const supabaseUrl = env.SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SECRET_KEY;

    supabaseClient = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Test connectivity by querying a real table (PGRST116 = no rows, still means connected)
    const { error } = await supabaseClient.from('documents').select('id').limit(1);

    if (error && error.code !== 'PGRST116') {
      console.warn(`⚠️  Supabase connection test failed: ${error.message}`);
      supabaseAvailable = false;
      return;
    }

    const hostname = new URL(supabaseUrl).hostname;
    console.log(`✅ Supabase connected (${hostname})`);
    supabaseAvailable = true;
  } catch (error) {
    console.warn(
      `⚠️  Supabase initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    supabaseAvailable = false;
  }
};

export const getSupabaseClient = () => supabaseClient;
export const isSupabaseAvailable = () => supabaseAvailable;
