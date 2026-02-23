/**
 * Supabase Client Initialization
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kryqizinejuwwbgbvksf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h5t0Ta5tmlfIU8aqICQ0pg_wm4qnRp-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    }
});
