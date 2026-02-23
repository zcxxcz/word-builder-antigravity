/**
 * db.js — Thin compatibility wrapper over api.js
 * Keeps the same export names so that modules don't need massive refactors.
 * All data now comes from Supabase (no IndexedDB / Dexie).
 */
import * as api from './services/api.js';

// ─── Settings ─────────────────────────────────────────────
const DEFAULTS = {
    dailyNewWords: 10,
    dailyReviewCap: 50,
    ttsEnabled: true,
    ttsRate: 1,
    activeWordlistId: 'builtin_1',
};

export async function getSetting(key) {
    const val = await api.getSetting(key);
    return val !== undefined ? val : DEFAULTS[key];
}

export async function setSetting(key, value) {
    return api.setSetting(key, value);
}

export async function initDefaultSettings() {
    const existing = await api.getAllSettings();
    for (const [key, def] of Object.entries(DEFAULTS)) {
        if (!(key in existing)) {
            await api.setSetting(key, def);
        }
    }
}

// ─── Word State ───────────────────────────────────────────
export async function getWordState(wordText) {
    return api.getWordState(wordText);
}

export async function saveWordState(state) {
    return api.saveWordState(state);
}

/**
 * Get words merged with their user states.
 * @param {string|null} wordlistId — e.g. "builtin_1", "custom_3", or null for all
 */
export async function getWordsWithState(wordlistId) {
    const [words, states] = await Promise.all([
        wordlistId ? api.getWords(wordlistId) : api.getAllWords(),
        api.getAllWordStates(),
    ]);
    const stateMap = new Map();
    for (const s of states) stateMap.set(s.wordText, s);

    return words.map(w => {
        const st = stateMap.get(w.word);
        return {
            ...w,
            state: st || null,
            level: st ? st.level : 0,
            step: st ? st.step : 'A',
            nextReview: st ? st.nextReview : null,
            lastReviewed: st ? st.lastReviewed : null,
        };
    });
}

// ─── Wordlists ────────────────────────────────────────────
export async function getWordlists() {
    return api.getWordlists();
}

export async function createCustomWordlist(name) {
    return api.createCustomWordlist(name);
}

export async function addWordToList(wordlistId, wordData) {
    return api.addCustomWord(wordlistId, wordData);
}

export async function importWordsToList(wordlistId, wordsArray) {
    return api.addCustomWords(wordlistId, wordsArray);
}

// ─── Sessions ─────────────────────────────────────────────
export async function saveSession(sessionData) {
    return api.saveSession(sessionData);
}

export async function getSessions() {
    return api.getSessions();
}

export async function getSessionsByDate(dateStr) {
    return api.getSessionsByDate(dateStr);
}

// ─── Data management ──────────────────────────────────────
export async function exportAllData() {
    return api.exportAllData();
}

export async function importAllData(jsonData) {
    // Import word states
    if (jsonData.wordStates) {
        for (const st of jsonData.wordStates) {
            await api.saveWordState(st);
        }
    }
    // Settings
    if (jsonData.settings) {
        for (const s of jsonData.settings) {
            await api.setSetting(s.key, s.value);
        }
    }
}

export async function clearAllData() {
    return api.clearAllUserData();
}

// ─── Legacy no-ops (removed features) ────────────────────
// These were Dexie-specific; keeping stubs so callers don't crash
export const db = null; // No more Dexie instance
