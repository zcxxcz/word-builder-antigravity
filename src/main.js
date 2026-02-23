/**
 * 初一背单词 Web App - Main Entry Point
 * All data is fetched from Supabase (no local storage).
 */
import './styles/index.css';

import { registerRoute, initRouter, navigateTo } from './router.js';
import { initDefaultSettings } from './db.js';
import { preloadVoices } from './services/tts.js';
import { initAuth, onAuthChange, isLoggedIn } from './services/auth.js';

// Page modules
import { renderToday } from './modules/today.js';
import { renderStudy } from './modules/study.js';
import { renderWordlist } from './modules/wordlist.js';
import { renderProgress } from './modules/progress.js';
import { renderSettings } from './modules/settings.js';
import { renderLogin } from './modules/login.js';

async function init() {
  // Initialize auth first
  const user = await initAuth();
  console.log('Auth initialized:', user ? user.email : 'not logged in');

  // Preload TTS voices
  preloadVoices();

  // Register routes
  registerRoute('today', renderToday);
  registerRoute('study', renderStudy);
  registerRoute('wordlist', renderWordlist);
  registerRoute('progress', renderProgress);
  registerRoute('settings', renderSettings);
  registerRoute('login', renderLogin);

  // If not logged in, force login page
  if (!user) {
    initRouter('login');
    return;
  }

  // Initialize default settings (checks Supabase, only writes missing ones)
  await initDefaultSettings();

  // Init router
  initRouter();

  // Listen for auth changes
  onAuthChange((newUser, event) => {
    if (newUser) {
      console.log('User logged in');
      initDefaultSettings().catch(console.warn);
    } else {
      console.log('User logged out');
      navigateTo('login');
    }
  });
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
