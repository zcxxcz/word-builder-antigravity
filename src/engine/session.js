/**
 * Learning Session Manager
 * 
 * Manages the state of a single study session, including:
 * - Current word queue progression
 * - Relapse (error) queue with dynamic insertion
 * - Session statistics collection
 * - Session persistence to DB
 */
import db, { getWordState, saveWordState, getSetting } from '../db.js';
import { processStepA, processStepB, todayStr } from './srs.js';
import { trackEvent } from '../services/analytics.js';

export class StudySession {
    constructor(taskData) {
        this.queue = [...taskData.queue]; // { word, state }
        this.relapseQueue = [];
        this.relapseCap = 10;
        this.relapseCount = 0;

        this.currentIndex = 0;
        this.currentStep = 'A'; // 'A' for meaning recall, 'B' for spelling
        this.stepAResult = null; // Store Step A result for current word

        // Session stats
        this.stats = {
            startedAt: new Date().toISOString(),
            totalWords: 0,
            newWords: 0,
            reviewWords: 0,
            spellingCorrect: 0,
            spellingWrong: 0,
            selfEvalStats: { know: 0, fuzzy: 0, dont_know: 0 },
            levelChanges: [],
            hardestWord: null,
            hardestWordErrors: 0,
        };

        this.isComplete = false;
        this.errorCountMap = {}; // wordId -> error count
    }

    async init() {
        this.relapseCap = await getSetting('relapseCap') || 10;
    }

    /**
     * Get current item to display
     * Returns null if session is complete
     */
    getCurrentItem() {
        if (this.currentIndex >= this.queue.length) {
            // Check relapse queue
            if (this.relapseQueue.length > 0) {
                const relapseItem = this.relapseQueue.shift();
                this.queue.push(relapseItem);
                // currentIndex still points to this new item
            } else {
                this.isComplete = true;
                return null;
            }
        }

        const item = this.queue[this.currentIndex];
        return {
            word: item.word,
            state: item.state,
            step: this.currentStep,
            progress: this.currentIndex + 1,
            total: this.queue.length,
        };
    }

    /**
     * Handle Step A (meaning recall) self-evaluation
     */
    async handleStepA(selfEval) {
        const item = this.queue[this.currentIndex];

        // Get fresh state from DB
        let state = await getWordState(item.word.id);

        // Process Step A
        this.stepAResult = processStepA(state, selfEval);

        // Track self-eval
        this.stats.selfEvalStats[selfEval]++;

        trackEvent('self_eval', {
            wordId: item.word.id,
            word: item.word.word,
            choice: selfEval
        });

        // Move to Step B
        this.currentStep = 'B';
    }

    /**
     * Handle Step B (spelling) submission
     * @param {boolean} correct - whether spelling was correct
     * @returns {{ correct: boolean, needsCorrection: boolean, correctSpelling: string }}
     */
    async handleStepB(correct) {
        const item = this.queue[this.currentIndex];

        // Get fresh state from DB
        let state = await getWordState(item.word.id);
        const oldLevel = state.level || 0;

        // Process Step B with Step A context
        const newState = processStepB(state, correct, this.stepAResult);

        // Save updated state
        await saveWordState(newState);

        // Update item's state reference
        item.state = newState;

        // Track stats
        if (correct) {
            this.stats.spellingCorrect++;
        } else {
            this.stats.spellingWrong++;

            // Track error count per word
            this.errorCountMap[item.word.id] = (this.errorCountMap[item.word.id] || 0) + 1;
            if (this.errorCountMap[item.word.id] > this.stats.hardestWordErrors) {
                this.stats.hardestWord = item.word.word;
                this.stats.hardestWordErrors = this.errorCountMap[item.word.id];
            }
        }

        // Level change tracking
        if (oldLevel !== newState.level) {
            this.stats.levelChanges.push({
                word: item.word.word,
                from: oldLevel,
                to: newState.level
            });
            trackEvent('word_level_change', {
                word: item.word.word,
                from: oldLevel,
                to: newState.level
            });
        }

        // Add to relapse if wrong or Step A was "don't know"
        const shouldRelapse = !correct || this.stepAResult?.relapse;
        if (shouldRelapse && this.relapseCount < this.relapseCap) {
            // Only add if not already in relapse to avoid infinite loops
            if (!item._isRelapse) {
                this.relapseQueue.push({ ...item, _isRelapse: true, state: newState });
                this.relapseCount++;
            }
        }

        trackEvent('spelling_submit', {
            wordId: item.word.id,
            word: item.word.word,
            correct
        });

        this.stats.totalWords++;

        return {
            correct,
            needsCorrection: !correct,
            correctSpelling: item.word.word,
            newLevel: newState.level,
            oldLevel,
        };
    }

    /**
     * Move to next word after completing both steps
     */
    advance() {
        this.currentIndex++;
        this.currentStep = 'A';
        this.stepAResult = null;
    }

    /**
     * Get session completion stats
     */
    getReport() {
        const totalSpelling = this.stats.spellingCorrect + this.stats.spellingWrong;
        return {
            ...this.stats,
            endedAt: new Date().toISOString(),
            spellingAccuracy: totalSpelling > 0
                ? Math.round((this.stats.spellingCorrect / totalSpelling) * 100)
                : 0,
            masteredNew: this.stats.levelChanges.filter(c => c.to === 3).length,
        };
    }

    /**
     * Save session to database
     */
    async saveSession() {
        const report = this.getReport();
        const sessionData = {
            date: todayStr(),
            learnedCount: report.newWords,
            reviewCount: report.reviewWords,
            totalWords: report.totalWords,
            spellingAccuracy: report.spellingAccuracy,
            selfEvalStats: report.selfEvalStats,
            duration: Math.round((new Date() - new Date(report.startedAt)) / 1000),
            hardestWord: report.hardestWord,
            masteredNew: report.masteredNew,
            createdAt: new Date().toISOString(),
        };
        await db.sessions.add(sessionData);

        // Push session to cloud (fire-and-forget)
        import('../services/sync.js').then(({ pushSession }) => {
            pushSession(sessionData).catch(() => { });
        }).catch(() => { });

        trackEvent('session_complete', report);
    }
}
