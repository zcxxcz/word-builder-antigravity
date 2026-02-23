import { supabase } from './src/services/supabaseClient.js';
import { processStepA, processStepB } from './src/engine/srs.js';

// Hardcoding a test user id or getting it from a quick login if possible.
// Actually, let's just log in first to test RLS
async function run() {
    console.log('Logging in...');
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123'
    });
    if (authErr) {
        console.error('Login failed:', authErr.message);
        return;
    }

    const uid = authData.user.id;
    console.log('Logged in as', uid);

    const word = 'ready';

    console.log('Fetching state for', word);
    let { data: stateData, error: stateErr } = await supabase
        .from('user_word_state').select('*')
        .eq('user_id', uid)
        .eq('word_text', word)
        .maybeSingle();

    if (stateErr) {
        console.error('Fetch error:', stateErr);
        return;
    }

    let state = stateData ? {
        id: stateData.id,
        userId: stateData.user_id,
        wordText: stateData.word_text,
        level: stateData.level,
        step: stateData.step,
        nextReviewAt: stateData.next_review,
        lastSeenAt: stateData.last_reviewed,
        updatedAt: stateData.updated_at,
    } : { wordText: word };

    console.log('Current state:', state);

    const stepAResult = processStepA(state, 'know');
    const newState = processStepB(state, true, stepAResult);

    console.log('New state to save:', newState);

    const row = {
        user_id: uid,
        word_text: newState.wordText || newState.word_text,
        level: newState.level ?? 0,
        step: newState.step || 'A',
        next_review: newState.nextReviewAt || newState.nextReview || newState.next_review || null,
        last_reviewed: newState.lastSeenAt || newState.lastReviewed || newState.last_reviewed || null,
        updated_at: new Date().toISOString(),
    };

    console.log('Upserting row:', row);
    try {
        const start = Date.now();
        const { data: savedData, error: saveErr } = await supabase
            .from('user_word_state')
            .upsert(row, { onConflict: 'user_id,word_text' })
            .select().single();

        console.log('Save result (took ' + (Date.now() - start) + 'ms):', saveErr ? saveErr.message : 'OK', savedData);
    } catch (err) {
        console.error('Exception during save:', err);
    }

    process.exit(0);
}

run();
