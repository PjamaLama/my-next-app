import { NextApiRequest, NextApiResponse } from 'next';
import { helloFlow } from '../../lib/genkit-template';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    console.log(`API: Running Genkit hello flow for: ${name}`);
    
    const result = await helloFlow(name);
    
    return res.status(200).json({ 
      success: true, 
      result: result
    });

  } catch (error) {
    console.error('API: Genkit hello flow failed:', error);
    return res.status(500).json({ 
      error: 'Failed to run hello flow',
      details: error instanceof Error ? error.message : String(error)
    });
  }
} 