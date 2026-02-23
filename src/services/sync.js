/**
 * Cloud Sync Service
 * 
 * Offline-first sync between IndexedDB (local) and Supabase (cloud).
 * - Pushes local changes to cloud in real-time
 * - Pulls cloud data on login / reconnect
 * - Conflict resolution: take higher level for userWordState
 */
import { supabase } from './supabaseClient.js';
import { getUser, isLoggedIn } from './auth.js';
import db, { getSetting, setSetting } from '../db.js';

let syncInProgress = false;
let isOnline = navigator.onLine;
let pendingSync = false;
const syncListeners = new Set();

// ─────────────── Status & Events ───────────────

export function onSyncStatusChange(callback) {
    syncListeners.add(callback);
    return () => syncListeners.delete(callback);
}

function notifySyncStatus(status, detail = '') {
    for (const cb of syncListeners) {
        try { cb(status, detail); } catch (e) { console.error(e); }
    }
}

export function getOnlineStatus() {
    return isOnline;
}

// ─────────────── Network Listener ───────────────

export function setupNetworkListener() {
    window.addEventListener('online', async () => {
        isOnline = true;
        updateOfflineBanner(false);
        notifySyncStatus('online');
        if (isLoggedIn()) {
            console.log('[Sync] Back online, starting full sync...');
            await fullSync();
        }
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateOfflineBanner(true);
        notifySyncStatus('offline');
        console.log('[Sync] Went offline');
    });

    if (!isOnline) {
        updateOfflineBanner(true);
    }
}

function updateOfflineBanner(show) {
    let banner = document.getElementById('offline-banner');
    if (show) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.className = 'offline-banner';
            banner.innerHTML = '📡 当前离线，数据暂存本地，联网后自动同步';
            document.body.prepend(banner);
        }
        banner.classList.add('show');
    } else {
        if (banner) banner.classList.remove('show');
    }
}

// ─────────────── Full Sync ───────────────

export async function fullSync() {
    if (syncInProgress) {
        pendingSync = true;
        console.log('[Sync] Sync already in progress, queued');
        return;
    }

    const user = getUser();
    console.log('[Sync] fullSync called. isLoggedIn:', isLoggedIn(), 'isOnline:', isOnline, 'user:', user?.email);

    if (!isLoggedIn() || !isOnline) {
        console.warn('[Sync] Skipping fullSync — not logged in or offline');
        return;
    }

    syncInProgress = true;
    notifySyncStatus('syncing');

    try {
        console.log('[Sync] ── Starting full sync for', user.email, '──');

        console.log('[Sync] Step 1/5: Syncing custom wordlists...');
        await syncCustomWordlists(user.id);

        console.log('[Sync] Step 2/5: Pulling word states from cloud...');
        await pullWordStates(user.id);

        console.log('[Sync] Step 3/5: Pushing word states to cloud...');
        await pushWordStates(user.id);

        console.log('[Sync] Step 4/5: Syncing sessions...');
        await syncSessions(user.id);

        console.log('[Sync] Step 5/5: Syncing settings...');
        await syncSettings(user.id);

        await setSetting('lastSyncAt', new Date().toISOString());
        notifySyncStatus('synced', new Date().toISOString());
        console.log('[Sync] ── Full sync completed ✅ ──');
    } catch (err) {
        console.error('[Sync] ❌ Full sync failed:', err);
        notifySyncStatus('error', err.message);
    } finally {
        syncInProgress = false;
        if (pendingSync) {
            pendingSync = false;
            await fullSync();
        }
    }
}

// ─────────────── Custom Wordlists ───────────────

async function syncCustomWordlists(userId) {
    // Get local custom wordlists (non-builtin)
    const allWordlists = await db.wordlists.toArray();
    const localCustom = allWordlists.filter(wl => wl.source !== 'builtin');
    console.log('[Sync] Local custom wordlists:', localCustom.length);

    // Get cloud custom wordlists
    const { data: cloudWordlists, error: fetchErr } = await supabase
        .from('custom_wordlists')
        .select('*')
        .eq('user_id', userId);
    if (fetchErr) { console.error('[Sync] Fetch cloud wordlists error:', fetchErr); throw fetchErr; }
    console.log('[Sync] Cloud custom wordlists:', cloudWordlists?.length || 0);

    const cloudByName = new Map((cloudWordlists || []).map(wl => [wl.name, wl]));

    // ── Push local custom wordlists to cloud ──
    for (const local of localCustom) {
        if (cloudByName.has(local.name)) continue; // Already exists

        // Create wordlist in cloud
        const { data: newWl, error: createErr } = await supabase
            .from('custom_wordlists')
            .insert({ user_id: userId, name: local.name, created_at: local.createdAt || new Date().toISOString() })
            .select()
            .single();
        if (createErr) { console.warn('[Sync] Create cloud wordlist error:', createErr); continue; }
        console.log(`[Sync]   Pushed wordlist "${local.name}" → cloud id=${newWl.id}`);

        // Push all words in this wordlist
        const localWords = await db.words.where('wordlistId').equals(local.id).toArray();
        if (localWords.length > 0) {
            const wordRows = localWords.map(w => ({
                wordlist_id: newWl.id,
                word: w.word,
                meaning_cn: w.meaningCn || '',
                phonetic: w.phonetic || '',
                unit: w.unit || '',
                example1: w.example1 || '',
                example2: w.example2 || '',
            }));
            const { error: wordsErr } = await supabase.from('custom_words').insert(wordRows);
            if (wordsErr) console.warn('[Sync] Push words error for', local.name, ':', wordsErr);
            else console.log(`[Sync]   Pushed ${localWords.length} words for "${local.name}"`);
        }
    }

    // ── Pull cloud custom wordlists to local ──
    const localNames = new Set(localCustom.map(wl => wl.name));

    for (const cloud of (cloudWordlists || [])) {
        if (localNames.has(cloud.name)) {
            console.log(`[Sync]   Wordlist "${cloud.name}" already exists locally, skip`);
            continue;
        }

        // Create wordlist locally
        const newLocalId = await db.wordlists.add({
            name: cloud.name,
            source: 'cloud_sync',
            createdAt: cloud.created_at || new Date().toISOString(),
        });
        console.log(`[Sync]   Pulled wordlist "${cloud.name}" → local id=${newLocalId}`);

        // Pull all words in this cloud wordlist
        const { data: cloudWords, error: wordsErr } = await supabase
            .from('custom_words')
            .select('*')
            .eq('wordlist_id', cloud.id);
        if (wordsErr) { console.warn('[Sync] Pull words error for', cloud.name, ':', wordsErr); continue; }

        if (cloudWords && cloudWords.length > 0) {
            const wordRows = cloudWords.map(w => ({
                wordlistId: newLocalId,
                word: w.word,
                meaningCn: w.meaning_cn || '',
                phonetic: w.phonetic || '',
                unit: w.unit || '',
                example1: w.example1 || '',
                example2: w.example2 || '',
                source: 'cloud_sync',
            }));
            await db.words.bulkAdd(wordRows);
            console.log(`[Sync]   Pulled ${cloudWords.length} words for "${cloud.name}"`);
        }
    }

    console.log('[Sync] Custom wordlists synced ✅');
}

// ─────────────── Word States ───────────────

async function pullWordStates(userId) {
    const { data: cloudStates, error } = await supabase
        .from('user_word_state')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('[Sync] Pull word states error:', error);
        throw error;
    }

    console.log('[Sync] Cloud word states:', cloudStates?.length || 0);
    if (!cloudStates || cloudStates.length === 0) return;

    const allWords = await db.words.toArray();
    const textToWordId = new Map();
    for (const w of allWords) {
        textToWordId.set(w.word.toLowerCase(), w.id);
    }
    console.log('[Sync] Local words available for matching:', textToWordId.size);

    const localStates = await db.userWordState.toArray();
    const localByWordId = new Map(localStates.map(s => [s.wordId, s]));

    let imported = 0, updated = 0, skipped = 0, kept = 0;

    for (const cloud of cloudStates) {
        const wordId = textToWordId.get(cloud.word_text.toLowerCase());
        if (!wordId) {
            console.log(`[Sync]   SKIP "${cloud.word_text}" — not found locally`);
            skipped++;
            continue;
        }

        const local = localByWordId.get(wordId);

        if (!local) {
            await db.userWordState.add({
                wordId,
                level: cloud.level,
                lastSeenAt: cloud.last_seen_at,
                nextReviewAt: cloud.next_review_at,
                wrongCount: cloud.wrong_count,
                correctStreak: cloud.correct_streak,
                updatedAt: cloud.updated_at,
                syncStatus: 'synced',
            });
            console.log(`[Sync]   IMPORT "${cloud.word_text}" level=${cloud.level}`);
            imported++;
        } else {
            const cloudLevel = cloud.level ?? 0;
            const localLevel = local.level ?? 0;
            const cloudTime = new Date(cloud.updated_at || 0).getTime();
            const localTime = new Date(local.updatedAt || 0).getTime();

            if (cloudLevel > localLevel) {
                await db.userWordState.update(local.id, {
                    level: cloud.level,
                    lastSeenAt: cloud.last_seen_at,
                    nextReviewAt: cloud.next_review_at,
                    wrongCount: cloud.wrong_count,
                    correctStreak: cloud.correct_streak,
                    updatedAt: cloud.updated_at,
                    syncStatus: 'synced',
                });
                console.log(`[Sync]   UPDATE "${cloud.word_text}" cloud=${cloudLevel} > local=${localLevel}`);
                updated++;
            } else if (cloudLevel === localLevel && cloudTime > localTime) {
                await db.userWordState.update(local.id, {
                    lastSeenAt: cloud.last_seen_at,
                    nextReviewAt: cloud.next_review_at,
                    wrongCount: Math.min(cloud.wrong_count, local.wrongCount),
                    correctStreak: Math.max(cloud.correct_streak, local.correctStreak),
                    updatedAt: cloud.updated_at,
                    syncStatus: 'synced',
                });
                console.log(`[Sync]   UPDATE "${cloud.word_text}" same level=${cloudLevel}, cloud newer`);
                updated++;
            } else {
                console.log(`[Sync]   KEEP "${cloud.word_text}" cloud=${cloudLevel} <= local=${localLevel}`);
                kept++;
            }
        }
    }

    console.log(`[Sync] Pull result: ${imported} imported, ${updated} updated, ${kept} kept, ${skipped} skipped`);
}

async function pushWordStates(userId) {
    const localStates = await db.userWordState.toArray();
    console.log('[Sync] Local word states to push:', localStates.length);
    if (localStates.length === 0) return;

    const allWords = await db.words.toArray();
    const wordIdToText = new Map();
    const wordIdToSource = new Map();
    for (const w of allWords) {
        wordIdToText.set(w.id, w.word);
        wordIdToSource.set(w.id, w.source || '');
    }

    const rawRows = localStates
        .filter(s => wordIdToText.has(s.wordId))
        .map(s => ({
            user_id: userId,
            word_text: wordIdToText.get(s.wordId),
            wordlist_source: wordIdToSource.get(s.wordId),
            level: s.level || 0,
            last_seen_at: s.lastSeenAt,
            next_review_at: s.nextReviewAt,
            wrong_count: s.wrongCount || 0,
            correct_streak: s.correctStreak || 0,
            updated_at: s.updatedAt || new Date().toISOString(),
        }));

    // Deduplicate by word_text — keep the entry with the higher level
    const deduped = new Map();
    for (const row of rawRows) {
        const key = row.word_text.toLowerCase();
        const existing = deduped.get(key);
        if (!existing || row.level > existing.level) {
            deduped.set(key, row);
        }
    }
    const rows = [...deduped.values()];

    console.log('[Sync] Pushing', rows.length, 'word states to cloud (deduped from', rawRows.length, 'raw)...');
    if (rows.length === 0) return;

    // Push in batches of 100 to avoid payload limits
    for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
            .from('user_word_state')
            .upsert(batch, { onConflict: 'user_id,word_text' });

        if (error) {
            console.error('[Sync] Push word states batch error:', error);
            throw error;
        }
        console.log(`[Sync] Pushed batch ${i / 100 + 1}/${Math.ceil(rows.length / 100)}`);
    }

    // Mark synced
    for (const s of localStates) {
        await db.userWordState.update(s.id, { syncStatus: 'synced' });
    }
    console.log('[Sync] All word states pushed ✅');
}

// ─────────────── Sessions ───────────────

async function syncSessions(userId) {
    const localSessions = await db.sessions.toArray();
    console.log('[Sync] Local sessions:', localSessions.length);
    if (localSessions.length === 0) {
        // Still pull from cloud
        const { data: cloudSessions, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('user_id', userId);

        if (error) { console.error('[Sync] Pull sessions error:', error); throw error; }
        console.log('[Sync] Cloud sessions to import:', cloudSessions?.length || 0);

        for (const cs of (cloudSessions || [])) {
            await db.sessions.add({
                date: cs.date,
                learnedCount: cs.learned_count,
                reviewCount: cs.review_count,
                spellingAccuracy: cs.spelling_accuracy,
                duration: cs.duration,
                totalWords: cs.total_words,
                masteredNew: cs.mastered_new,
                hardestWord: cs.hardest_word,
                createdAt: cs.created_at,
            });
        }
        return;
    }

    const { data: cloudSessions, error: fetchErr } = await supabase
        .from('sessions')
        .select('date, created_at')
        .eq('user_id', userId);

    if (fetchErr) { console.error('[Sync] Fetch cloud sessions error:', fetchErr); throw fetchErr; }

    const cloudDates = new Set((cloudSessions || []).map(s => `${s.date}_${s.created_at}`));

    const newSessions = localSessions
        .filter(s => !cloudDates.has(`${s.date}_${s.createdAt || ''}`))
        .map(s => ({
            user_id: userId,
            date: s.date,
            learned_count: s.learnedCount || 0,
            review_count: s.reviewCount || 0,
            spelling_accuracy: s.spellingAccuracy || 0,
            duration: s.duration || 0,
            total_words: s.totalWords || 0,
            mastered_new: s.masteredNew || 0,
            hardest_word: s.hardestWord || '',
            created_at: s.createdAt || new Date().toISOString(),
        }));

    console.log('[Sync] New sessions to push:', newSessions.length);

    // Insert one by one, skip conflicts (409)
    let pushed = 0, skipped = 0;
    for (const sess of newSessions) {
        const { error } = await supabase.from('sessions').insert(sess);
        if (error) {
            if (error.code === '23505' || error.message?.includes('duplicate')) {
                skipped++;
            } else {
                console.warn('[Sync] Push session warning:', error);
                skipped++;
            }
        } else {
            pushed++;
        }
    }
    console.log(`[Sync] Sessions pushed: ${pushed}, skipped duplicates: ${skipped}`);

    // Pull cloud sessions not in local
    if (cloudSessions && cloudSessions.length > 0) {
        const { data: fullCloudSessions, error: pullErr } = await supabase
            .from('sessions').select('*').eq('user_id', userId);
        if (pullErr) { console.error('[Sync] Pull sessions error:', pullErr); throw pullErr; }

        const localDates = new Set(localSessions.map(s => s.date));
        let pulled = 0;
        for (const cs of (fullCloudSessions || [])) {
            if (!localDates.has(cs.date)) {
                await db.sessions.add({
                    date: cs.date, learnedCount: cs.learned_count, reviewCount: cs.review_count,
                    spellingAccuracy: cs.spelling_accuracy, duration: cs.duration,
                    totalWords: cs.total_words, masteredNew: cs.mastered_new,
                    hardestWord: cs.hardest_word, createdAt: cs.created_at,
                });
                pulled++;
            }
        }
        console.log('[Sync] Pulled', pulled, 'cloud sessions');
    }
}

// ─────────────── Settings ───────────────

async function syncSettings(userId) {
    const { data: cloudSettings, error: fetchErr } = await supabase
        .from('user_settings').select('*').eq('user_id', userId);

    if (fetchErr) { console.error('[Sync] Fetch settings error:', fetchErr); throw fetchErr; }

    const skipKeys = new Set(['lastSyncAt']);

    if (cloudSettings && cloudSettings.length > 0) {
        for (const cs of cloudSettings) {
            if (skipKeys.has(cs.key)) continue;
            const local = await db.settings.get(cs.key);
            const cloudTime = new Date(cs.updated_at || 0).getTime();
            const localTime = new Date(local?.updatedAt || 0).getTime();

            if (!local || cloudTime > localTime) {
                await db.settings.put({ key: cs.key, value: cs.value, updatedAt: cs.updated_at });
            }
        }
    }

    const localSettings = await db.settings.toArray();
    const rows = localSettings
        .filter(s => !skipKeys.has(s.key))
        .map(s => ({
            user_id: userId, key: s.key, value: s.value,
            updated_at: s.updatedAt || new Date().toISOString(),
        }));

    console.log('[Sync] Settings to push:', rows.length);

    if (rows.length > 0) {
        const { error } = await supabase
            .from('user_settings')
            .upsert(rows, { onConflict: 'user_id,key' });
        if (error) { console.error('[Sync] Push settings error:', error); throw error; }
    }
    console.log('[Sync] Settings synced ✅');
}

// ─────────────── Real-time Push ───────────────

export async function pushSingleWordState(wordId) {
    if (!isLoggedIn() || !isOnline) {
        console.log('[Sync] pushSingleWordState skipped: loggedIn=', isLoggedIn(), 'online=', isOnline);
        return;
    }

    try {
        const user = getUser();
        const state = await db.userWordState.where('wordId').equals(wordId).first();
        if (!state) return;

        const word = await db.words.get(wordId);
        if (!word) return;

        const { error } = await supabase
            .from('user_word_state')
            .upsert({
                user_id: user.id,
                word_text: word.word,
                wordlist_source: word.source || '',
                level: state.level || 0,
                last_seen_at: state.lastSeenAt,
                next_review_at: state.nextReviewAt,
                wrong_count: state.wrongCount || 0,
                correct_streak: state.correctStreak || 0,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,word_text' });

        if (error) {
            console.error('[Sync] pushSingleWordState error for', word.word, ':', error);
        } else {
            console.log('[Sync] Pushed word state:', word.word, 'level=', state.level);
        }
    } catch (err) {
        console.error('[Sync] pushSingleWordState exception:', err);
    }
}

export async function pushSession(sessionData) {
    if (!isLoggedIn() || !isOnline) return;

    try {
        const user = getUser();
        const { error } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                date: sessionData.date,
                learned_count: sessionData.learnedCount || 0,
                review_count: sessionData.reviewCount || 0,
                spelling_accuracy: sessionData.spellingAccuracy || 0,
                duration: sessionData.duration || 0,
                total_words: sessionData.totalWords || 0,
                mastered_new: sessionData.masteredNew || 0,
                hardest_word: sessionData.hardestWord || '',
                created_at: sessionData.createdAt || new Date().toISOString(),
            });

        if (error) console.error('[Sync] pushSession error:', error);
        else console.log('[Sync] Pushed session for date:', sessionData.date);
    } catch (err) {
        console.error('[Sync] pushSession exception:', err);
    }
}
