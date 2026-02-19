/**
 * DeepSeek API Service (via backend proxy)
 * 
 * Calls /api/generate endpoint which proxies to DeepSeek API
 * Returns Chinese meaning and example sentences
 */

/**
 * Generate Chinese meaning and example sentences for a word
 * @param {string} word - English word
 * @param {string[]} englishDefinitions - English definitions from dictionary
 * @returns {{ meaningCn: string, example1: string, example2: string }}
 */
export async function generateWordContent(word, englishDefinitions = []) {
    try {
        const resp = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word, englishDefinitions })
        });

        if (!resp.ok) {
            console.warn('DeepSeek API failed, using fallback');
            return getFallback(word);
        }

        const data = await resp.json();
        return {
            meaningCn: data.meaningCn || '',
            example1: data.example1 || '',
            example2: data.example2 || '',
        };
    } catch (err) {
        console.error('DeepSeek generation failed:', err);
        return getFallback(word);
    }
}

function getFallback(word) {
    return {
        meaningCn: '',
        example1: `I like to use the word ${word}.`,
        example2: '',
    };
}
