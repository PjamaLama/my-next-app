import type { NextApiRequest, NextApiResponse } from 'next';

interface N8nCallbackPayload {
  sessionId: string;
  partialResponse?: string;
  finalResponse?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
  actions?: Array<{
    type: 'insertRow' | 'updateCell';
    sheet: string;
    row: number;
    column?: string;
    value?: string;
  }>;
}

// Extend global type to store n8n callbacks map during runtime
declare global {
  // eslint-disable-next-line no-var
  var n8nCallbacks: Map<string, any> | undefined;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId, partialResponse, finalResponse, status, error, actions }: N8nCallbackPayload = req.body;

    console.log(`🔗 [N8N_CALLBACK] Received callback for session: ${sessionId}`);
    console.log(`🔗 [N8N_CALLBACK] Status: ${status}`);
    console.log(`🔗 [N8N_CALLBACK] Partial response: ${partialResponse}`);
    console.log(`🔗 [N8N_CALLBACK] Final response: ${finalResponse}`);

    // Store the callback data in a way that can be retrieved by the frontend
    // This could be in memory, Redis, or a database
    // For now, we'll use a simple in-memory store (not recommended for production)
    
    // TODO: Implement proper session storage (Redis, database, etc.)
    if (!global.n8nCallbacks) global.n8nCallbacks = new Map();
    global.n8nCallbacks.set(sessionId, {
      status,
      partialResponse,
      finalResponse,
      error,
      actions,
      timestamp: new Date().toISOString()
    });

    // Send SSE or WebSocket update if needed
    // For now, just return success
    res.status(200).json({ 
      success: true, 
      message: 'Callback received',
      sessionId 
    });

  } catch (error) {
    console.error('🔗 [N8N_CALLBACK] Error processing callback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process callback' 
    });
  }
} 