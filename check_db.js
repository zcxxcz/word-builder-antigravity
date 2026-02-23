import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kryqizinejuwwbgbvksf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h5t0Ta5tmlfIU8aqICQ0pg_wm4qnRp-';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    }
});

async function check() {
    const { data: d1 } = await supabase.from('sessions').select('*').limit(1);
    console.log('sessions cols:', d1 ? Object.keys(d1[0] || {}) : 'none');

    const { data: d2 } = await supabase.from('user_word_state').select('*').limit(1);
    console.log('user_word_state cols:', d2 ? Object.keys(d2[0] || {}) : 'none');

    const { data: d3 } = await supabase.from('user_settings').select('*').limit(1);
    console.log('user_settings cols:', d3 ? Object.keys(d3[0] || {}) : 'none');

    process.exit(0);
}
check();
