import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// CORS for dev
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

/**
 * POST /api/generate
 * Proxy to DeepSeek API for generating Chinese meanings and examples
 */
app.post('/api/generate', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });
    }

    const { word, englishDefinitions = [] } = req.body;
    if (!word) {
        return res.status(400).json({ error: 'Missing "word" field' });
    }

    try {
        const prompt = buildPrompt(word, englishDefinitions);

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个初中英语教学助手。请严格按要求返回JSON格式数据。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 300,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('DeepSeek API error:', response.status, errText);
            return res.status(502).json({ error: 'DeepSeek API failed' });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(502).json({ error: 'Empty response from DeepSeek' });
        }

        try {
            const parsed = JSON.parse(content);
            res.json({
                meaningCn: parsed.meaning_cn || parsed.meaningCn || '',
                example1: parsed.example1 || '',
                example2: parsed.example2 || ''
            });
        } catch (parseErr) {
            console.error('Failed to parse DeepSeek response:', content);
            res.status(502).json({ error: 'Invalid JSON from DeepSeek' });
        }
    } catch (err) {
        console.error('DeepSeek proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

function buildPrompt(word, englishDefinitions) {
    const defContext = englishDefinitions.length > 0
        ? `\n英文释义参考：\n${englishDefinitions.slice(0, 3).join('\n')}`
        : '';

    return `请为英语单词 "${word}" 生成以下内容，面向初一学生（12-13岁）：
${defContext}

请返回JSON格式：
{
  "meaning_cn": "中文释义（每条≤12汉字，最多3条义项，用;分隔，避免生僻翻译）",
  "example1": "英文例句1（6-12个词，生活化短句，必须包含 ${word}）",
  "example2": "英文例句2（6-12个词，不同场景，必须包含 ${word}）"
}

注意：
- 中文释义要简短常用，适合初中生理解
- 例句不使用复杂从句，单词不超过初中水平
- 必须返回有效JSON`;
}

// Serve static files in production
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`DeepSeek API: ${process.env.DEEPSEEK_API_KEY ? 'configured ✅' : 'NOT configured ❌'}`);
});
