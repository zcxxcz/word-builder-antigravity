/**
 * api.js — Supabase data access layer
 * All CRUD operations go through this module.
 * No local storage; every call hits the server.
 */
import { supabase } from './supabaseClient.js';
import { getUser as getCurrentUser } from './auth.js';

function userId() {
    const u = getCurrentUser();
    if (!u) throw new Error('Not authenticated');
    return u.id;
}

// ─── Wordlists ────────────────────────────────────────────
export async function getWordlists() {
    // shared wordlists (built-in) + user custom_wordlists
    const { data: builtIn, error: e1 } = await supabase
        .from('wordlists').select('*').order('id');
    if (e1) throw e1;

    const { data: custom, error: e2 } = await supabase
        .from('custom_wordlists').select('*')
        .eq('user_id', userId()).order('created_at');
    if (e2) throw e2;

    // Normalise both into a unified shape
    const lists = builtIn.map(w => ({
        id: `builtin_${w.id}`,
        numericId: w.id,
        name: w.name,
        source: w.source,
        isCustom: false,
        createdAt: w.created_at,
    }));
    for (const c of custom) {
        lists.push({
            id: `custom_${c.id}`,
            numericId: c.id,
            name: c.name,
            source: 'custom',
            isCustom: true,
            createdAt: c.created_at,
        });
    }
    return lists;
}

export async function createCustomWordlist(name) {
    const { data, error } = await supabase
        .from('custom_wordlists')
        .insert({ user_id: userId(), name })
        .select().single();
    if (error) throw error;
    return { id: `custom_${data.id}`, numericId: data.id, name: data.name, isCustom: true };
}

// ─── Words ────────────────────────────────────────────────
export async function getWords(wordlistId) {
    // wordlistId can be "builtin_1" or "custom_3" or null (all)
    if (!wordlistId) {
        // Return all built-in words
        const { data, error } = await supabase
            .from('words').select('*').order('id');
        if (error) throw error;
        return data.map(mapWord);
    }

    const { type, numId } = parseListId(wordlistId);
    if (type === 'builtin') {
        const { data, error } = await supabase
            .from('words').select('*')
            .eq('wordlist_id', numId).order('id');
        if (error) throw error;
        return data.map(mapWord);
    } else {
        const { data, error } = await supabase
            .from('custom_words').select('*')
            .eq('wordlist_id', numId).order('id');
        if (error) throw error;
        return data.map(mapCustomWord);
    }
}

export async function getAllWords() {
    // All built-in words + user's custom words
    const { data: builtIn, error: e1 } = await supabase
        .from('words').select('*').order('id');
    if (e1) throw e1;

    const { data: custom, error: e2 } = await supabase
        .from('custom_words').select('*')
        .eq('user_id', userId()).order('id');
    if (e2) throw e2;

    return [
        ...builtIn.map(mapWord),
        ...custom.map(mapCustomWord),
    ];
}

export async function addCustomWord(wordlistId, wordData) {
    const { numId } = parseListId(wordlistId);
    const { data, error } = await supabase
        .from('custom_words')
        .insert({
            wordlist_id: numId,
            user_id: userId(),
            word: wordData.word,
            meaning_cn: wordData.meaning_cn || '',
            phonetic: wordData.phonetic || '',
            example1: wordData.example1 || wordData.example || '',
            example2: wordData.example2 || '',
        })
        .select().single();
    if (error) throw error;
    return mapCustomWord(data);
}

export async function addCustomWords(wordlistId, wordsArray) {
    const { numId } = parseListId(wordlistId);
    const uid = userId();
    const rows = wordsArray.map(w => ({
        wordlist_id: numId,
        user_id: uid,
        word: w.word,
        meaning_cn: w.meaning_cn || '',
        phonetic: w.phonetic || '',
        example1: w.example1 || w.example || '',
        example2: w.example2 || '',
    }));
    const { data, error } = await supabase
        .from('custom_words').insert(rows).select();
    if (error) throw error;
    return data.map(mapCustomWord);
}

function mapWord(row) {
    return {
        id: row.id,
        wordlistId: row.wordlist_id,
        word: row.word,
        meaning_cn: row.meaning_cn,
        unit: row.unit,
        phonetic: row.phonetic || '',
        example: row.example1 || '',
        example2: row.example2 || '',
        source: row.source || '',
    };
}

function mapCustomWord(row) {
    return {
        id: `cw_${row.id}`,
        wordlistId: `custom_${row.wordlist_id}`,
        word: row.word,
        meaning_cn: row.meaning_cn,
        unit: '',
        phonetic: row.phonetic || '',
        example: row.example1 || '',
        example2: row.example2 || '',
        source: 'custom',
    };
}

function parseListId(listId) {
    if (typeof listId === 'number') return { type: 'builtin', numId: listId };
    const str = String(listId);
    if (str.startsWith('custom_')) return { type: 'custom', numId: parseInt(str.replace('custom_', '')) };
    if (str.startsWith('builtin_')) return { type: 'builtin', numId: parseInt(str.replace('builtin_', '')) };
    return { type: 'builtin', numId: parseInt(str) };
}

// ─── User Word State ──────────────────────────────────────
export async function getWordState(wordText) {
    const { data, error } = await supabase
        .from('user_word_state').select('*')
        .eq('user_id', userId())
        .eq('word_text', wordText)
        .maybeSingle();
    if (error) throw error;
    return data ? mapState(data) : null;
}

export async function getAllWordStates() {
    const { data, error } = await supabase
        .from('user_word_state').select('*')
        .eq('user_id', userId());
    if (error) throw error;
    return data.map(mapState);
}

export async function saveWordState(state) {
    const uid = userId();
    const row = {
        user_id: uid,
        word_text: state.wordText || state.word_text,
        level: state.level ?? 0,
        step: state.step || 'A',
        next_review: state.nextReviewAt || state.nextReview || state.next_review || null,
        last_reviewed: state.lastSeenAt || state.lastReviewed || state.last_reviewed || null,
        updated_at: new Date().toISOString(),
    };

    // Upsert by user_id + word_text
    const { data, error } = await supabase
        .from('user_word_state')
        .upsert(row, { onConflict: 'user_id,word_text' })
        .select().single();
    if (error) throw error;
    return mapState(data);
}

function mapState(row) {
    return {
        id: row.id,
        userId: row.user_id,
        wordText: row.word_text,
        level: row.level,
        step: row.step,
        nextReviewAt: row.next_review,
        lastSeenAt: row.last_reviewed,
        updatedAt: row.updated_at,
    };
}

// ─── Sessions ─────────────────────────────────────────────
export async function getSessions() {
    const { data, error } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId())
        .order('started_at', { ascending: false });
    if (error) throw error;
    return data.map(mapSession);
}

export async function getSessionsByDate(dateStr) {
    // dateStr = "YYYY-MM-DD"
    const start = `${dateStr}T00:00:00`;
    const end = `${dateStr}T23:59:59`;
    const { data, error } = await supabase
        .from('sessions').select('*')
        .eq('user_id', userId())
        .gte('started_at', start)
        .lte('started_at', end)
        .order('started_at', { ascending: false });
    if (error) throw error;
    return data.map(mapSession);
}

export async function saveSession(sessionData) {
    const row = {
        user_id: userId(),
        mode: sessionData.mode || 'mixed',
        started_at: sessionData.startedAt || sessionData.started_at || new Date().toISOString(),
        ended_at: sessionData.endedAt || sessionData.ended_at || new Date().toISOString(),
        total_words: sessionData.totalWords || sessionData.total_words || 0,
        correct_count: sessionData.correctCount || sessionData.correct_count || 0,
        wrong_count: sessionData.wrongCount || sessionData.wrong_count || 0,
        new_words: sessionData.newWords || sessionData.new_words || 0,
        review_words: sessionData.reviewWords || sessionData.review_words || 0,
        duration_sec: sessionData.duration || sessionData.durationSec || sessionData.duration_sec || 0,
    };
    const { data, error } = await supabase
        .from('sessions').insert(row).select().single();
    if (error) throw error;
    return mapSession(data);
}

function mapSession(row) {
    return {
        id: row.id,
        mode: row.mode,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        totalWords: row.total_words,
        correctCount: row.correct_count,
        wrongCount: row.wrong_count,
        newWords: row.new_words,
        reviewWords: row.review_words,
        durationSec: row.duration_sec,
    };
}

// ─── Settings ─────────────────────────────────────────────
export async function getSetting(key) {
    const { data, error } = await supabase
        .from('user_settings').select('value')
        .eq('user_id', userId())
        .eq('key', key)
        .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    try { return JSON.parse(data.value); } catch { return data.value; }
}

export async function setSetting(key, value) {
    const row = {
        user_id: userId(),
        key,
        value: JSON.stringify(value),
        updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
        .from('user_settings')
        .upsert(row, { onConflict: 'user_id,key' });
    if (error) throw error;
}

export async function getAllSettings() {
    const { data, error } = await supabase
        .from('user_settings').select('*')
        .eq('user_id', userId());
    if (error) throw error;
    const result = {};
    for (const row of data) {
        try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    return result;
}

// ─── Bulk data ops (export / import / clear) ──────────────
export async function exportAllData() {
    const uid = userId();
    const [states, sessions, settings] = await Promise.all([
        supabase.from('user_word_state').select('*').eq('user_id', uid),
        supabase.from('sessions').select('*').eq('user_id', uid),
        supabase.from('user_settings').select('*').eq('user_id', uid),
    ]);
    return {
        wordStates: (states.data || []).map(mapState),
        sessions: (sessions.data || []).map(mapSession),
        settings: (settings.data || []),
    };
}

export async function clearAllUserData() {
    const uid = userId();
    await Promise.all([
        supabase.from('user_word_state').delete().eq('user_id', uid),
        supabase.from('sessions').delete().eq('user_id', uid),
        supabase.from('user_settings').delete().eq('user_id', uid),
        supabase.from('custom_words').delete().eq('user_id', uid),
        supabase.from('custom_wordlists').delete().eq('user_id', uid),
    ]);
}
