import { NextApiRequest, NextApiResponse } from 'next';
import { testGenkitIntegration } from '../../lib/genkit-template';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('API: Running Genkit full integration test');
    
    await testGenkitIntegration();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Full integration test completed successfully'
    });

  } catch (error) {
    console.error('API: Genkit integration test failed:', error);
    return res.status(500).json({ 
      error: 'Failed to run integration test',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 