/**
 * TTS Service using Web Speech API
 */
import { getSetting } from '../db.js';

let synth = null;

function getSynth() {
    if (!synth) {
        synth = window.speechSynthesis;
    }
    return synth;
}

/**
 * Speak a word in English
 */
export async function speak(text) {
    const enabled = await getSetting('ttsEnabled');
    if (!enabled) return;

    const s = getSynth();
    if (!s) return;

    // Cancel any ongoing speech
    s.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = (await getSetting('ttsRate')) || 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to find an English voice
    const voices = s.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en-US'))
        || voices.find(v => v.lang.startsWith('en'));
    if (enVoice) {
        utterance.voice = enVoice;
    }

    s.speak(utterance);
}

/**
 * Preload voices (some browsers need this)
 */
export function preloadVoices() {
    const s = getSynth();
    if (s) {
        s.getVoices();
        if (s.onvoiceschanged !== undefined) {
            s.onvoiceschanged = () => s.getVoices();
        }
    }
}
