/**
 * SRS (Spaced Repetition System) Engine
 * 
 * Level system:
 *   L0 = 陌生, L1 = 认识, L2 = 熟练, L3 = 掌握
 * 
 * Review intervals by level:
 *   L0: +1 day, L1: +2 days, L2: +5 days, L3: +10 days
 * 
 * Step A (意思回想): Only affects next_review, NOT level
 * Step B (拼写): Affects level (+1 correct, -1 wrong)
 */

const INTERVALS = {
    0: 1,   // L0: +1 day
    1: 2,   // L1: +2 days
    2: 5,   // L2: +5 days
    3: 10,  // L3: +10 days
};

const LEVEL_NAMES = ['陌生', '认识', '熟练', '掌握'];

export function getLevelName(level) {
    return LEVEL_NAMES[level] || '未知';
}

/**
 * Get today's date string (YYYY-MM-DD)
 */
export function todayStr() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Compute next review date based on level
 */
function computeNextReview(level) {
    const days = INTERVALS[level] || 1;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/**
 * Process Step A (意思回想) — does NOT change level
 * Returns: { relapse: boolean, nextReviewAdjust: string|null }
 */
export function processStepA(state, selfEval) {
    const result = { relapse: false, nextReviewAdjust: null };
    const today = todayStr();
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

    switch (selfEval) {
        case 'know':
            // No adjustment
            break;
        case 'fuzzy':
            // Shorten interval: ensure next review is at most tomorrow
            result.nextReviewAdjust = tomorrow;
            break;
        case 'dont_know':
            // Add to relapse and set review to tomorrow
            result.relapse = true;
            result.nextReviewAdjust = tomorrow;
            break;
    }

    return result;
}

/**
 * Process Step B (拼写) — changes level
 * Returns updated state object
 */
export function processStepB(state, correct, stepAResult) {
    const now = new Date().toISOString();
    const newState = { ...state };

    if (correct) {
        newState.level = Math.min((newState.level || 0) + 1, 3);
        newState.correctStreak = (newState.correctStreak || 0) + 1;
    } else {
        newState.level = Math.max((newState.level || 0) - 1, 0);
        newState.wrongCount = (newState.wrongCount || 0) + 1;
        newState.correctStreak = 0;
    }

    newState.lastSeenAt = now;

    // Compute next_review based on final level
    let nextReview = computeNextReview(newState.level);

    // If Step A suggested a shorter interval (fuzzy/dont_know), take the shorter one
    if (stepAResult && stepAResult.nextReviewAdjust) {
        if (stepAResult.nextReviewAdjust < nextReview) {
            nextReview = stepAResult.nextReviewAdjust;
        }
    }

    newState.nextReviewAt = nextReview;

    return newState;
}

/**
 * Check if a word is due for review today
 */
export function isDueForReview(state) {
    if (!state || !state.nextReviewAt) return false;
    return state.nextReviewAt <= todayStr();
}

/**
 * Check if a word has never been studied
 */
export function isNewWord(state) {
    return !state || !state.lastSeenAt;
}

export { INTERVALS, LEVEL_NAMES };
