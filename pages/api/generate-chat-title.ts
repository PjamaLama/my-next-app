import type { NextApiRequest, NextApiResponse } from 'next';
import { genkit } from 'genkit';
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

type SimpleMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = req.body as { messages?: SimpleMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Heuristic fallback: first user message trimmed
    const firstUser = messages.find(m => m.role === 'user');
    const heuristic = (firstUser?.content || 'New Chat')
      .replace(/\n+/g, ' ')
      .slice(0, 48)
      .trim() || 'New Chat';

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ title: heuristic });
    }

    // Use only last few short messages for cheap prompt
    const recent = messages
      .slice(-6)
      .map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${(m.content || '').slice(0, 180)}`)
      .join('\n');

    const ai = genkit({ plugins: [googleAI({ apiKey })], model: gemini15Flash });

    const prompt = `You create a concise chat title from a short conversation.
Rules:
- Max 6 words, <= 45 characters
- No quotes, no trailing punctuation
- Title Case if appropriate
- Be specific to the topic

Conversation:
${recent}

Respond with the title only.`;

    const { text } = await ai.generate(prompt);
    const raw = (text || '').trim();
    const cleaned = raw
      .replace(/^"|^'|\.$|!$|\?$|\s+$/g, '')
      .slice(0, 60)
      .trim();

    return res.status(200).json({ title: cleaned || heuristic });
  } catch (error) {
    console.error('generate-chat-title error:', error);
    return res.status(200).json({ title: 'New Chat' });
  }
}


