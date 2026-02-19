/**
 * 初一背单词 Web App - Main Entry Point
 */
import './styles/index.css';
import { registerRoute, initRouter } from './router.js';
import db, { isBuiltinImported, importBuiltinWordlist, initDefaultSettings } from './db.js';
import { preloadVoices } from './services/tts.js';

// Page modules
import { renderToday } from './modules/today.js';
import { renderStudy } from './modules/study.js';
import { renderWordlist } from './modules/wordlist.js';
import { renderProgress } from './modules/progress.js';
import { renderSettings } from './modules/settings.js';

// Data
import { grade7aWords } from './data/grade7a.js';
import { grade7bWords } from './data/grade7b.js';

async function init() {
    // Initialize default settings
    await initDefaultSettings();

    // Import built-in word lists if first time
    const imported = await isBuiltinImported();
    if (!imported) {
        console.log('First launch: importing built-in word lists...');
        await importBuiltinWordlist('七年级上册（外研版）', grade7aWords, 'waiyanbanseven_a');
        await importBuiltinWordlist('七年级下册（外研版）', grade7bWords, 'waiyanbanseven_b');
        console.log('Built-in word lists imported.');
    }

    // Preload TTS voices
    preloadVoices();

    // Register routes
    registerRoute('today', renderToday);
    registerRoute('study', renderStudy);
    registerRoute('wordlist', renderWordlist);
    registerRoute('progress', renderProgress);
    registerRoute('settings', renderSettings);

    // Init router
    initRouter();

    // Register PWA service worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');
        } catch (err) {
            console.warn('Service Worker registration failed:', err);
        }
    }
}

// Start app
init().catch(err => {
    console.error('App initialization failed:', err);
    document.getElementById('page-container').innerHTML = `
    <div class="page">
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">应用初始化失败<br>${err.message}</div>
      </div>
    </div>
  `;
});
