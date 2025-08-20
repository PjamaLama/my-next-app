import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminDb } from '../../lib/firebaseAdmin';

type BetaSignupRequest = {
  uid: string;
  email: string;
};

type BetaSignupResponse = {
  success: boolean;
  message: string;
  remainingSpots?: number;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<BetaSignupResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { uid, email } = req.body as BetaSignupRequest;

  if (!uid || !email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing uid or email' 
    });
  }

  try {
    const db = getAdminDb();
    
    // Check if user is already registered
    const userRef = db.doc(`beta-users/${uid}`);
    const userSnap = await userRef.get();
    
    if (userSnap.exists) {
      return res.status(200).json({
        success: false,
        message: "You're already registered for beta!"
      });
    }
    
    // Get current beta stats
    const metaRef = db.doc('meta/beta');
    const metaSnap = await metaRef.get();
    
    const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
    const testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;
    const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
    
    // Check if beta is full
    if (!open && testerCount >= capacity) {
      return res.status(400).json({
        success: false,
        message: 'Sorry, the beta is full. Please check back later.'
      });
    }
    
    // Register user
    await userRef.set({
      email,
      registeredAt: new Date(),
      status: 'active'
    });
    
    // Update tester count
    await metaRef.set({
      testerCount: testerCount + 1,
      updatedAt: new Date()
    }, { merge: true });
    
    const remainingSpots = Math.max(0, capacity - (testerCount + 1));
    
    return res.status(200).json({
      success: true,
      message: 'Thanks for joining the beta! We will be in touch soon.',
      remainingSpots
    });
  } catch (error: any) {
    console.error('beta-signup-firebase error', error);
    return res.status(500).json({
      success: false,
      message: 'An internal error occurred.',
      error: error?.message
    });
  }
}
