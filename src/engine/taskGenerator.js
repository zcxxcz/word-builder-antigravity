/**
 * Daily Task Queue Generator
 * 
 * Queue order:
 * 1. Due reviews (next_review <= today), up to review_cap
 * 2. New words (never studied), up to daily_new
 * 3. Relapse words are added dynamically during session
 */
import db, { getWordState, getAllSettings } from '../db.js';
import { isDueForReview, isNewWord, todayStr } from './srs.js';

/**
 * Generate today's task queue
 * @param {Object} options - { wordlistIds: number[]|null, mode: 'all'|'review'|'new' }
 * @returns {{ reviews: Array, newWords: Array, totalCount: number, reviewCount: number, newCount: number }}
 */
export async function generateDailyTasks(options = {}) {
    const settings = await getAllSettings();
    const { dailyNew, reviewCap } = settings;
    const mode = options.mode || 'all';

    // Get all words
    let words;
    if (options.wordlistIds && options.wordlistIds.length > 0) {
        words = await db.words
            .where('wordlistId')
            .anyOf(options.wordlistIds)
            .toArray();
    } else {
        words = await db.words.toArray();
    }

    // Load all word states
    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    const reviews = [];
    const newWords = [];

    for (const word of words) {
        const state = stateMap.get(word.id);

        if (state && isDueForReview(state)) {
            reviews.push({ word, state });
        } else if (isNewWord(state)) {
            newWords.push({ word, state: state || null });
        }
    }

    // Sort reviews: overdue words first (most overdue first)
    reviews.sort((a, b) => {
        const dateA = a.state.nextReviewAt || '9999';
        const dateB = b.state.nextReviewAt || '9999';
        return dateA.localeCompare(dateB);
    });

    // Apply caps
    let finalReviews = mode === 'new' ? [] : reviews.slice(0, reviewCap);
    let finalNew = mode === 'review' ? [] : newWords.slice(0, dailyNew);

    // Build queue: reviews first, then new words
    const queue = [...finalReviews, ...finalNew];

    return {
        queue,
        reviews: finalReviews,
        newWords: finalNew,
        totalCount: queue.length,
        reviewCount: finalReviews.length,
        newCount: finalNew.length,
        estimatedMinutes: Math.ceil(queue.length * 0.5) // ~30 sec per word
    };
}

/**
 * Get stats for today page display (without generating full queue)
 */
export async function getTodayStats() {
    const settings = await getAllSettings();
    const words = await db.words.toArray();
    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    let reviewCount = 0;
    let newCount = 0;
    let totalLearned = 0;
    let masteredCount = 0;

    const levelDist = [0, 0, 0, 0]; // L0, L1, L2, L3

    for (const word of words) {
        const state = stateMap.get(word.id);
        if (state) {
            if (isDueForReview(state)) reviewCount++;
            totalLearned++;
            levelDist[state.level || 0]++;
            if (state.level === 3) masteredCount++;
        } else {
            newCount++;
        }
    }

    return {
        reviewCount: Math.min(reviewCount, settings.reviewCap),
        newCount: Math.min(newCount, settings.dailyNew),
        totalWords: words.length,
        totalLearned,
        masteredCount,
        levelDist,
        estimatedMinutes: Math.ceil((Math.min(reviewCount, settings.reviewCap) + Math.min(newCount, settings.dailyNew)) * 0.5)
    };
}
