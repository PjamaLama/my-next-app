import { rateLimiter, clearCaches } from '@/lib/googleSheets';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const stats = rateLimiter.getStats();

      return res.status(200).json({
        success: true,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Google Sheets stats:', error);

      return res.status(500).json({
        error: 'Failed to fetch stats',
        details: message
      });
    }
  } else if (req.method === 'POST' && req.body?.action === 'clearCaches') {
    try {
      clearCaches();

      return res.status(200).json({
        success: true,
        message: 'Caches cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error clearing caches:', error);

      return res.status(500).json({
        error: 'Failed to clear caches',
        details: message
      });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
