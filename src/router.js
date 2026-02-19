/**
 * Simple hash-based router for SPA navigation
 */
const routes = {};
let currentRoute = null;
let beforeRouteChange = null;

export function registerRoute(path, handler) {
    routes[path] = handler;
}

export function setBeforeRouteChange(fn) {
    beforeRouteChange = fn;
}

export function navigateTo(path) {
    window.location.hash = path;
}

export function getCurrentRoute() {
    return currentRoute;
}

async function handleRoute() {
    const hash = window.location.hash.slice(1) || 'today';
    const path = hash.split('?')[0];

    if (beforeRouteChange) {
        const proceed = await beforeRouteChange(currentRoute, path);
        if (proceed === false) return;
    }

    currentRoute = path;
    const container = document.getElementById('page-container');
    const tabBar = document.getElementById('tab-bar');

    // Study page is immersive — hide tab bar
    if (path === 'study') {
        tabBar.classList.add('hidden');
    } else {
        tabBar.classList.remove('hidden');
    }

    // Update active tab
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === path);
    });

    const handler = routes[path];
    if (handler) {
        container.innerHTML = '';
        await handler(container);
    } else {
        // Default to today
        navigateTo('today');
    }
}

export function initRouter() {
    // Listen for hash changes
    window.addEventListener('hashchange', handleRoute);

    // Tab click handlers
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', () => {
            navigateTo(tab.dataset.tab);
        });
    });

    // Initial route
    handleRoute();
}
