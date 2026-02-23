import { supabase } from './src/services/supabaseClient.js';

async function run() {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123'
    });
    if (authErr) {
        console.error('Login failed:', authErr.message);
        return;
    }

    const uid = authData.user.id;

    const { data, error } = await supabase
        .from('user_word_state').select('*')
        .eq('user_id', uid)
        .eq('word_text', 'textbook')
        .maybeSingle();

    console.log('DB State for textbook:', data);
    process.exit(0);
}
run();
