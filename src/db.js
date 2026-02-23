import Dexie from 'dexie';

const db = new Dexie('WordBuilderDB');

db.version(1).stores({
    wordlists: '++id, name, source, createdAt',
    words: '++id, wordlistId, word, meaningCn, unit, phonetic, example1, example2, source',
    userWordState: '++id, &wordId, level, lastSeenAt, nextReviewAt, wrongCount, correctStreak',
    sessions: '++id, date, learnedCount, reviewCount, spellingAccuracy, duration',
    settings: 'key',
    events: '++id, type, data, timestamp'
});

// Schema v2: add sync fields
db.version(2).stores({
    wordlists: '++id, name, source, createdAt',
    words: '++id, wordlistId, word, meaningCn, unit, phonetic, example1, example2, source',
    userWordState: '++id, &wordId, level, lastSeenAt, nextReviewAt, wrongCount, correctStreak, updatedAt, syncStatus',
    sessions: '++id, date, learnedCount, reviewCount, spellingAccuracy, duration, createdAt, syncStatus',
    settings: 'key, updatedAt',
    events: '++id, type, data, timestamp',
    syncMeta: 'key'
}).upgrade(tx => {
    // Add updatedAt to existing userWordState records
    return tx.table('userWordState').toCollection().modify(row => {
        if (!row.updatedAt) row.updatedAt = new Date().toISOString();
        if (!row.syncStatus) row.syncStatus = 'pending';
    });
});

// Default settings
const DEFAULT_SETTINGS = {
    dailyNew: 10,
    reviewCap: 40,
    relapseCap: 10,
    ttsEnabled: true,
    ttsRate: 0.9,
    activeWordlistId: null, // null = all wordlists
};

export async function getSetting(key) {
    const row = await db.settings.get(key);
    if (row) return row.value;
    return DEFAULT_SETTINGS[key] ?? null;
}

export async function setSetting(key, value) {
    await db.settings.put({ key, value });
}

export async function getAllSettings() {
    const all = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
        all[k] = await getSetting(k);
    }
    return all;
}

export async function initDefaultSettings() {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        const existing = await db.settings.get(k);
        if (!existing) {
            await db.settings.put({ key: k, value: v });
        }
    }
}

// Check if built-in word lists are already imported
export async function isBuiltinImported() {
    const count = await db.wordlists.where('source').equals('builtin').count();
    return count > 0;
}

// Import built-in word list
export async function importBuiltinWordlist(name, words, source) {
    const id = await db.wordlists.add({
        name,
        source: 'builtin',
        createdAt: new Date().toISOString()
    });

    const wordRows = words.map(w => ({
        wordlistId: id,
        word: w.word,
        meaningCn: w.meaning_cn,
        unit: w.unit,
        phonetic: w.phonetic || '',
        example1: w.example || '',
        example2: '',
        source: source
    }));

    await db.words.bulkAdd(wordRows);
    return id;
}

// Get or create user word state
export async function getWordState(wordId) {
    let state = await db.userWordState.where('wordId').equals(wordId).first();
    if (!state) {
        state = {
            wordId,
            level: 0,
            lastSeenAt: null,
            nextReviewAt: null,
            wrongCount: 0,
            correctStreak: 0
        };
    }
    return state;
}

export async function saveWordState(state) {
    state.updatedAt = new Date().toISOString();
    state.syncStatus = 'pending';
    if (state.id) {
        await db.userWordState.update(state.id, state);
    } else {
        state.id = await db.userWordState.add(state);
    }

    // Real-time push to cloud (fire-and-forget, lazy import to avoid circular deps)
    import('./services/sync.js').then(({ pushSingleWordState }) => {
        pushSingleWordState(state.wordId).catch(() => { });
    }).catch(() => { });

    return state;
}

// Get all words with state
export async function getWordsWithState(wordlistId) {
    const words = wordlistId
        ? await db.words.where('wordlistId').equals(wordlistId).toArray()
        : await db.words.toArray();

    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    return words.map(w => ({
        ...w,
        state: stateMap.get(w.id) || { level: 0, nextReviewAt: null, wrongCount: 0, correctStreak: 0 }
    }));
}

// Export all data as JSON
export async function exportAllData() {
    const [wordlists, words, userWordState, sessions, settings] = await Promise.all([
        db.wordlists.toArray(),
        db.words.toArray(),
        db.userWordState.toArray(),
        db.sessions.toArray(),
        db.settings.toArray()
    ]);
    return { wordlists, words, userWordState, sessions, settings, exportedAt: new Date().toISOString() };
}

// Import data from JSON
export async function importAllData(data) {
    await db.transaction('rw', db.wordlists, db.words, db.userWordState, db.sessions, db.settings, async () => {
        await db.wordlists.clear();
        await db.words.clear();
        await db.userWordState.clear();
        await db.sessions.clear();
        await db.settings.clear();

        if (data.wordlists) await db.wordlists.bulkAdd(data.wordlists);
        if (data.words) await db.words.bulkAdd(data.words);
        if (data.userWordState) await db.userWordState.bulkAdd(data.userWordState);
        if (data.sessions) await db.sessions.bulkAdd(data.sessions);
        if (data.settings) await db.settings.bulkAdd(data.settings);
    });
}

// Clear all data
export async function clearAllData() {
    await db.transaction('rw', db.wordlists, db.words, db.userWordState, db.sessions, db.settings, db.events, async () => {
        await db.wordlists.clear();
        await db.words.clear();
        await db.userWordState.clear();
        await db.sessions.clear();
        await db.settings.clear();
        await db.events.clear();
    });
}

export default db;
