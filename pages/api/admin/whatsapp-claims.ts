import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';

function isAllowedAdmin(decoded: any): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (decoded?.admin === true) return true;
  const email = (decoded?.email || '').toLowerCase();
  return !!email && admins.includes(email);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (!isAllowedAdmin(decoded)) return res.status(403).json({ error: 'Forbidden' });

    const db = getAdminDb();

    if (req.method === 'GET') {
      // Get all WhatsApp claims
      const claimsSnapshot = await db.collection('wa_id_claims').get();
      const claims = claimsSnapshot.docs.map(doc => ({
        waId: doc.id,
        uid: doc.data().uid,
        claimedAt: doc.data().claimedAt?.toDate?.() || doc.data().claimedAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      }));

      // Get user details for each claim
      const claimsWithUserDetails = await Promise.all(
        claims.map(async (claim) => {
          try {
            const userDoc = await db.collection('users').doc(claim.uid).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              return {
                ...claim,
                userEmail: userData?.email || 'Unknown',
                userDisplayName: userData?.displayName || 'Unknown',
                userCreatedAt: userData?.createdAt?.toDate?.() || userData?.createdAt
              };
            }
            return {
              ...claim,
              userEmail: 'User deleted',
              userDisplayName: 'User deleted',
              userCreatedAt: null
            };
          } catch (error) {
            return {
              ...claim,
              userEmail: 'Error fetching user',
              userDisplayName: 'Error fetching user',
              userCreatedAt: null
            };
          }
        })
      );

      return res.status(200).json({
        claims: claimsWithUserDetails,
        totalClaims: claimsWithUserDetails.length
      });
    }

    if (req.method === 'DELETE') {
      // Remove a specific claim (admin override)
      const { waId } = req.body;
      
      if (!waId) {
        return res.status(400).json({ error: 'WhatsApp ID is required' });
      }

      const claimRef = db.collection('wa_id_claims').doc(waId);
      const claimDoc = await claimRef.get();

      if (!claimDoc.exists) {
        return res.status(404).json({ error: 'Claim not found' });
      }

      const claimData = claimDoc.data();
      
      // Remove the claim
      await claimRef.delete();
      
      // Also remove the wa_id from the user document
      if (claimData?.uid) {
        const userRef = db.collection('users').doc(claimData.uid);
        await userRef.update({
          wa_id: null,
          wa_id_updated_at: new Date()
        });
      }

      return res.status(200).json({
        success: true,
        message: `WhatsApp claim for ${waId} removed successfully`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('admin/whatsapp-claims error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
