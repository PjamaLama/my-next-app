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

    // Basic file size validation (approximate base64 size)
    if (Array.isArray(images) && images.length > 0) {
      const maxFileSize = 8 * 1024 * 1024; // 8MB per file
      const totalSizeLimit = 20 * 1024 * 1024; // 20MB total
      let totalSize = 0;
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const fileSize = Math.ceil((image.data.length * 3) / 4);
        if (fileSize > maxFileSize) {
          return res.status(413).json({
            error: 'File too large',
            details: `File ${i + 1} exceeds the 8MB limit. Please compress or resize your file.`,
            fileIndex: i,
            fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
            maxSize: '8MB',
          });
        }
        totalSize += fileSize;
      }
      if (totalSize > totalSizeLimit) {
        return res.status(413).json({
          error: 'Total file size too large',
          details: `Combined file size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds the 20MB limit. Please reduce the number or size of files.`,
          totalSize: `${(totalSize / 1024 / 1024).toFixed(1)}MB`,
          maxTotalSize: '20MB',
        });
      }
    }

    // Derive a reliable base URL for server-side tool calls
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = ((req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || '').toString();
    const baseUrl = host ? `${proto}://${host}` : undefined;

    const ctx = { ...(context || {}), _baseUrl: baseUrl };

    const result = await processChatMessage(message, ctx, conversationHistory || [], images || []);
    // If debug mode requested, ensure plan/toolResults bubble up (processMessage already includes when context.debug=true)
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}


