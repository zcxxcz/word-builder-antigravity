/**
 * Lightweight Analytics / Event Tracking
 * Events are stored locally in IndexedDB for export
 */
import db from '../db.js';

/**
 * Track an event
 * @param {string} type - Event type (e.g., 'start_session', 'spelling_submit')
 * @param {Object} data - Event data
 */
export function trackEvent(type, data = {}) {
    // Fire and forget — don't await
    db.events.add({
        type,
        data,
        timestamp: new Date().toISOString()
    }).catch(err => {
        console.warn('Analytics tracking failed:', err);
    });
}

/**
 * Get events for a date range
 */
export async function getEvents(startDate, endDate) {
    const events = await db.events
        .where('timestamp')
        .between(startDate, endDate + 'Z')
        .toArray();
    return events;
}

/**
 * Get all events
 */
export async function getAllEvents() {
    return db.events.toArray();
}
