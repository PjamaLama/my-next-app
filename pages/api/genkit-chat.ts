import { NextApiRequest, NextApiResponse } from 'next';
import { processMessage as processChatMessage } from '@/lib/chat/processMessage';

export const config = {
  api: {
    // Increase to accommodate base64-encoded uploads (adds ~33% overhead)
    bodyParser: { sizeLimit: '128mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
		const { message, context, conversationHistory, images } = req.body || {};

		if ((message == null || message === '') && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message is required' });
    }

		const result = await processChatMessage(message, context || {}, conversationHistory || [], images || []);
    // If debug mode requested, ensure plan/toolResults bubble up (processMessage already includes when context.debug=true)
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


