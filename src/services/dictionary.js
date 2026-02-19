/**
 * Free Dictionary API Service
 * https://dictionaryapi.dev/
 */

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

/**
 * Look up a word in the Free Dictionary API
 * @param {string} word 
 * @returns {{ phonetic: string, definitions: string[], audio: string|null }}
 */
export async function lookupWord(word) {
    try {
        const resp = await fetch(`${API_BASE}/${encodeURIComponent(word.toLowerCase().trim())}`);
        if (!resp.ok) {
            return { phonetic: '', definitions: [], audio: null, found: false };
        }

        const data = await resp.json();
        const entry = data[0];

        // Extract phonetic
        let phonetic = entry.phonetic || '';
        if (!phonetic && entry.phonetics) {
            const phItem = entry.phonetics.find(p => p.text);
            if (phItem) phonetic = phItem.text;
        }

        // Extract audio URL
        let audio = null;
        if (entry.phonetics) {
            const audioItem = entry.phonetics.find(p => p.audio && p.audio.length > 0);
            if (audioItem) audio = audioItem.audio;
        }

        // Extract definitions (English)
        const definitions = [];
        if (entry.meanings) {
            for (const meaning of entry.meanings) {
                const pos = meaning.partOfSpeech;
                for (const def of meaning.definitions.slice(0, 2)) {
                    definitions.push(`(${pos}) ${def.definition}`);
                }
                if (definitions.length >= 4) break;
            }
        }

        return { phonetic, definitions, audio, found: true };
    } catch (err) {
        console.error('Dictionary lookup failed:', err);
        return { phonetic: '', definitions: [], audio: null, found: false };
    }
}
