import type { NextApiRequest, NextApiResponse } from 'next';

interface N8nSessionData {
  status: 'processing' | 'completed' | 'error';
  partialResponse?: string;
  finalResponse?: string;
  error?: string;
  actions?: Array<{
    type: 'insertRow' | 'updateCell';
    sheet: string;
    row: number;
    column?: string;
    value?: string;
  }>;
  timestamp: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log(`🔗 [N8N_SESSION_STATUS] Checking status for session: ${sessionId}`);

    // Get the session data from the global store
    const n8nCallbacks = (global as any).n8nCallbacks as Map<string, N8nSessionData> | undefined;
    
    if (!n8nCallbacks || !n8nCallbacks.has(sessionId)) {
      return res.status(404).json({ 
        error: 'Session not found',
        sessionId 
      });
    }

    const sessionData = n8nCallbacks.get(sessionId);
    
    if (!sessionData) {
      return res.status(404).json({ 
        error: 'Session data not found',
        sessionId 
      });
    }

    console.log(`🔗 [N8N_SESSION_STATUS] Session status: ${sessionData.status}`);

    return res.status(200).json({
      success: true,
      sessionId,
      ...sessionData
    });

  } catch (error) {
    console.error('🔗 [N8N_SESSION_STATUS] Error checking session status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check session status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 