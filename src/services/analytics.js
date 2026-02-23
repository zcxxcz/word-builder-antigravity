/**
 * Lightweight Analytics / Event Tracking
 * Events are logged to console only (no local storage)
 */

/**
 * Track an event
 * @param {string} type - Event type (e.g., 'start_session', 'spelling_submit')
 * @param {Object} data - Event data
 */
export function trackEvent(type, data = {}) {
    console.debug('[analytics]', type, data);
}

/**
 * Get events for a date range (no-op without local storage)
 */
export async function getEvents(startDate, endDate) {
    return [];
}

/**
 * Get all events (no-op without local storage)
 */
export async function getAllEvents() {
    return [];
}
