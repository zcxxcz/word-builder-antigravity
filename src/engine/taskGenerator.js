/**
 * Daily Task Queue Generator
 * 
 * Queue order:
 * 1. Due reviews (next_review <= today), up to review_cap — from ALL wordlists
 * 2. New words (never studied), up to daily_new — prioritize active wordlist
 * 3. Relapse words are added dynamically during session
 */
import { getWordsWithState, getSetting, getWordlists } from '../db.js';
import { isDueForReview, isNewWord, todayStr } from './srs.js';

/**
 * Generate today's task queue
 * @param {Object} options - { wordlistIds: number[]|null, mode: 'all'|'review'|'new' }
 */
export async function generateDailyTasks(options = {}) {
    const dailyNew = await getSetting('dailyNewWords') || 10;
    const reviewCap = await getSetting('dailyReviewCap') || 50;
    const mode = options.mode || 'all';

    // Get ALL words with their states from Supabase
    const allWordsWithState = await getWordsWithState(null);

    const reviews = [];

    for (const w of allWordsWithState) {
        if (w.state && isDueForReview(w.state)) {
            reviews.push({ word: w, state: w.state });
        }
    }

    // Sort reviews by urgency: most overdue first
    reviews.sort((a, b) => {
        const aDate = a.state.nextReview || '1970-01-01';
        const bDate = b.state.nextReview || '1970-01-01';
        return aDate.localeCompare(bDate);
    });

    // Cap reviews
    const cappedReviews = reviews.slice(0, reviewCap);

    if (mode === 'review') {
        return {
            queue: cappedReviews,
            stats: { reviewCount: cappedReviews.length, newCount: 0 },
            fallbackUsed: false,
            activeListName: null,
        };
    }

    // Find new words
    const allNew = allWordsWithState.filter(w => isNewWord(w.state));

    // Get active wordlist
    const activeWordlistId = await getSetting('activeWordlistId');
    let activeListName = null;

    if (mode === 'new' || !activeWordlistId) {
        const newWords = allNew.slice(0, dailyNew).map(w => ({ word: w, state: null }));
        return {
            queue: [...cappedReviews, ...newWords],
            stats: { reviewCount: cappedReviews.length, newCount: newWords.length },
            fallbackUsed: false,
            activeListName: null,
        };
    }

    // Get active list name for display
    const lists = await getWordlists();
    const activeList = lists.find(l => l.id === activeWordlistId || l.numericId === activeWordlistId);
    activeListName = activeList?.name || '未知词表';

    // New words from active list
    const activeNew = allNew.filter(w => {
        const wlId = w.wordlistId;
        return wlId === activeWordlistId ||
            wlId === activeList?.numericId ||
            `builtin_${wlId}` === activeWordlistId;
    });
    // New words from other lists (preserve order)
    const otherNew = allNew.filter(w => !activeNew.includes(w));

    let picked = activeNew.slice(0, dailyNew).map(w => ({ word: w, state: null }));

    let fallbackUsed = false;
    if (picked.length < dailyNew && otherNew.length > 0) {
        const remaining = dailyNew - picked.length;
        picked = [...picked, ...otherNew.slice(0, remaining).map(w => ({ word: w, state: null }))];
        if (activeNew.length === 0) {
            fallbackUsed = true;
        }
    }

    if (mode === 'new') {
        return {
            queue: picked,
            stats: { reviewCount: 0, newCount: picked.length },
            fallbackUsed,
            activeListName,
        };
    }

    return {
        queue: [...cappedReviews, ...picked],
        stats: { reviewCount: cappedReviews.length, newCount: picked.length },
        fallbackUsed,
        activeListName,
    };
}

/**
 * Get stats for today page display (without generating full queue)
 */
export async function getTodayStats() {
    const dailyNew = await getSetting('dailyNewWords') || 10;
    const activeWordlistId = await getSetting('activeWordlistId');

    const allWordsWithState = await getWordsWithState(null);

    let reviewCount = 0;
    let totalLearned = 0;
    let masteredCount = 0;

    const levelDist = [0, 0, 0, 0]; // L0, L1, L2, L3

    for (const w of allWordsWithState) {
        if (w.state) {
            if (isDueForReview(w.state)) reviewCount++;
            totalLearned++;
            levelDist[w.state.level || 0]++;
            if (w.state.level === 3) masteredCount++;
        }
    }

    // Compute new word count respecting active wordlist
    const allNew = allWordsWithState.filter(w => isNewWord(w.state));

    let newCount = 0;
    let activeListExhausted = false;
    let activeListName = null;

    if (!activeWordlistId) {
        newCount = Math.min(allNew.length, dailyNew);
    } else {
        const lists = await getWordlists();
        const activeList = lists.find(l => l.id === activeWordlistId || l.numericId === activeWordlistId);
        activeListName = activeList?.name || '未知词表';

        const activeNew = allNew.filter(w => {
            const wlId = w.wordlistId;
            return wlId === activeWordlistId ||
                wlId === activeList?.numericId ||
                `builtin_${wlId}` === activeWordlistId;
        });
        const otherNew = allNew.filter(w => !activeNew.includes(w));

        if (activeNew.length === 0) {
            activeListExhausted = true;
        }

        newCount = Math.min(activeNew.length + otherNew.length, dailyNew);
    }

    return {
        reviewCount,
        newCount,
        totalLearned,
        masteredCount,
        totalWords: allWordsWithState.length,
        levelDist,
        activeListExhausted,
        activeListName,
    };
}
