/**
 * Daily Task Queue Generator
 * 
 * Queue order:
 * 1. Due reviews (next_review <= today), up to review_cap — from ALL wordlists
 * 2. New words (never studied), up to daily_new — prioritize active wordlist
 * 3. Relapse words are added dynamically during session
 */
import db, { getWordState, getAllSettings, getSetting } from '../db.js';
import { isDueForReview, isNewWord, todayStr } from './srs.js';

/**
 * Generate today's task queue
 * @param {Object} options - { wordlistIds: number[]|null, mode: 'all'|'review'|'new' }
 */
export async function generateDailyTasks(options = {}) {
    const settings = await getAllSettings();
    const { dailyNew, reviewCap } = settings;
    const mode = options.mode || 'all';

    // Get ALL words (reviews come from all wordlists)
    const allWords = await db.words.toArray();

    // Load all word states
    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    const reviews = [];

    for (const word of allWords) {
        const state = stateMap.get(word.id);
        if (state && isDueForReview(state)) {
            reviews.push({ word, state });
        }
    }

    // Sort reviews: most overdue first
    reviews.sort((a, b) => {
        const dateA = a.state.nextReviewAt || '9999';
        const dateB = b.state.nextReviewAt || '9999';
        return dateA.localeCompare(dateB);
    });

    // --- New words: prioritize active wordlist, fallback to others ---
    const { newWords, activeListExhausted, fallbackUsed, activeListName } =
        await pickNewWords(allWords, stateMap, dailyNew, settings.activeWordlistId);

    // Apply caps
    let finalReviews = mode === 'new' ? [] : reviews.slice(0, reviewCap);
    let finalNew = mode === 'review' ? [] : newWords;

    // Build queue: reviews first, then new words
    const queue = [...finalReviews, ...finalNew];

    return {
        queue,
        reviews: finalReviews,
        newWords: finalNew,
        totalCount: queue.length,
        reviewCount: finalReviews.length,
        newCount: finalNew.length,
        estimatedMinutes: Math.ceil(queue.length * 0.5),
        activeListExhausted,
        fallbackUsed,
        activeListName,
    };
}

/**
 * Pick new words: prioritize active wordlist, fallback to others if exhausted
 */
async function pickNewWords(allWords, stateMap, dailyNew, activeWordlistId) {
    let activeListName = null;
    let activeListExhausted = false;
    let fallbackUsed = false;

    // Separate new words by wordlist
    const allNew = allWords.filter(w => isNewWord(stateMap.get(w.id)));

    if (!activeWordlistId) {
        // No active list set — pick from all, original order
        return {
            newWords: allNew.slice(0, dailyNew).map(w => ({ word: w, state: null })),
            activeListExhausted: false,
            fallbackUsed: false,
            activeListName: null,
        };
    }

    // Get active list name for display
    const activeList = await db.wordlists.get(activeWordlistId);
    activeListName = activeList?.name || '未知词表';

    // New words from active list
    const activeNew = allNew.filter(w => w.wordlistId === activeWordlistId);
    // New words from other lists (preserve DB order)
    const otherNew = allNew.filter(w => w.wordlistId !== activeWordlistId);

    let picked = activeNew.slice(0, dailyNew).map(w => ({ word: w, state: null }));

    if (activeNew.length === 0) {
        activeListExhausted = true;
    }

    // If not enough from active list, fill from others
    if (picked.length < dailyNew && otherNew.length > 0) {
        const remaining = dailyNew - picked.length;
        const extra = otherNew.slice(0, remaining).map(w => ({ word: w, state: null }));
        picked = [...picked, ...extra];
        if (extra.length > 0) {
            fallbackUsed = true;
        }
        if (activeNew.length === 0) {
            activeListExhausted = true;
        }
    }

    return { newWords: picked, activeListExhausted, fallbackUsed, activeListName };
}

/**
 * Get stats for today page display (without generating full queue)
 */
export async function getTodayStats() {
    const settings = await getAllSettings();
    const allWords = await db.words.toArray();
    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    let reviewCount = 0;
    let totalLearned = 0;
    let masteredCount = 0;

    const levelDist = [0, 0, 0, 0]; // L0, L1, L2, L3

    for (const word of allWords) {
        const state = stateMap.get(word.id);
        if (state) {
            if (isDueForReview(state)) reviewCount++;
            totalLearned++;
            levelDist[state.level || 0]++;
            if (state.level === 3) masteredCount++;
        }
    }

    // Compute new word count respecting active wordlist
    const activeWordlistId = settings.activeWordlistId;
    const allNew = allWords.filter(w => isNewWord(stateMap.get(w.id)));

    let newCount = 0;
    let activeListExhausted = false;
    let activeListName = null;

    if (!activeWordlistId) {
        newCount = Math.min(allNew.length, settings.dailyNew);
    } else {
        const activeList = await db.wordlists.get(activeWordlistId);
        activeListName = activeList?.name || '未知词表';

        const activeNew = allNew.filter(w => w.wordlistId === activeWordlistId);
        const otherNew = allNew.filter(w => w.wordlistId !== activeWordlistId);

        if (activeNew.length === 0) {
            activeListExhausted = true;
        }

        newCount = Math.min(activeNew.length + otherNew.length, settings.dailyNew);
    }

    return {
        reviewCount: Math.min(reviewCount, settings.reviewCap),
        newCount,
        totalWords: allWords.length,
        totalLearned,
        masteredCount,
        levelDist,
        estimatedMinutes: Math.ceil((Math.min(reviewCount, settings.reviewCap) + newCount) * 0.5),
        activeListExhausted,
        activeListName,
    };
}
