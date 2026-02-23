/**
 * Auth Service — Email/Password via Supabase Auth
 */
import { supabase } from './supabaseClient.js';

let currentUser = null;
const authListeners = new Set();

/**
 * Sign up with email + password
 */
export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    // Set currentUser immediately if session is returned (email confirm disabled)
    if (data.user) {
        currentUser = data.user;
        console.log('[Auth] SignUp successful, user set:', data.user.email);
    }
    return data;
}

/**
 * Sign in with email + password
 */
export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    console.log('[Auth] SignIn successful, user set:', data.user.email);
    return data;
}

/**
 * Sign out
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentUser = null;
    console.log('[Auth] Signed out');
}

/**
 * Get the currently logged-in user (cached)
 */
export function getUser() {
    return currentUser;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
    return currentUser !== null;
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback) {
    authListeners.add(callback);
    return () => authListeners.delete(callback);
}

/**
 * Initialize auth — call on app startup
 * Restores session from localStorage if available
 */
export async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    console.log('[Auth] Init:', currentUser ? currentUser.email : 'not logged in');

    // Listen for future changes
    supabase.auth.onAuthStateChange((event, session) => {
        const prevUser = currentUser;
        currentUser = session?.user || null;
        console.log('[Auth] State change:', event, currentUser?.email || 'null');

        // Only notify if state actually changed
        if (prevUser?.id !== currentUser?.id) {
            for (const cb of authListeners) {
                try { cb(currentUser, event); } catch (e) { console.error('Auth listener error:', e); }
            }
        }
    });

    return currentUser;
}
