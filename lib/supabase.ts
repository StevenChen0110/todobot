import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// service_role key bypasses RLS — only use server-side
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
