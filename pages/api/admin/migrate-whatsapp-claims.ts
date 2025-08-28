import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';
import { firestore } from 'firebase-admin';
import type { DocumentData } from 'firebase-admin/firestore';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth check
    const bearer = req.headers.authorization || '';
    const idToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : undefined;
    if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (!isAllowedAdmin(decoded)) return res.status(403).json({ error: 'Forbidden' });

    const db = getAdminDb();

    // Get all users with WhatsApp IDs
    const usersSnapshot = await db.collection('users').where('wa_id', '!=', null).get();
    const usersWithWaId = usersSnapshot.docs.filter((doc: DocumentData) => doc.data().wa_id);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const userDoc of usersWithWaId) {
      try {
        const waId = userDoc.data().wa_id;
        const uid = userDoc.id;

        if (!waId || typeof waId !== 'string') {
          skippedCount++;
          continue;
        }

        // Check if claim already exists
        const existingClaim = await db.collection('wa_id_claims').doc(waId).get();
        
        if (existingClaim.exists) {
          // Claim exists, check if it belongs to this user
          const claimData = existingClaim.data();
          if (claimData?.uid === uid) {
            skippedCount++; // Already properly claimed
            continue;
          } else {
            // Claim exists but belongs to different user - this is a conflict
            console.warn(`WhatsApp ID ${waId} has conflicting claims: user ${uid} vs claim owner ${claimData?.uid}`);
            errorCount++;
            continue;
          }
        }

        // Create the claim
        await db.collection('wa_id_claims').doc(waId).set({
          uid: uid,
          claimedAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
          migrated: true
        });

        migratedCount++;
      } catch (error) {
        console.error(`Error migrating user ${userDoc.id}:`, error);
        errorCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp claims migration completed',
      results: {
        migrated: migratedCount,
        skipped: skippedCount,
        errors: errorCount,
        total: usersWithWaId.length
      }
    });

  } catch (err: any) {
    console.error('admin/migrate-whatsapp-claims error', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
