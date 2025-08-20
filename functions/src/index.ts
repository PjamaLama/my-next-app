/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall} from "firebase-functions/v2/https";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

// Initialize Firebase Admin
initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Function to get total user count from Firebase Auth
export const getUserCount = onCall(async (request) => {
  try {
    const auth = getAuth();
    const listUsersResult = await auth.listUsers();
    return {
      success: true,
      userCount: listUsersResult.users.length
    };
  } catch (error) {
    console.error('Error getting user count:', error);
    return {
      success: false,
      error: 'Failed to get user count'
    };
  }
});

// Function to get beta spots count and capacity
export const getBetaSpotsCount = onCall(async (request) => {
  try {
    const db = getFirestore();
    
    // Read centralized beta meta document
    const metaRef = db.doc('meta/beta');
    const metaSnap = await metaRef.get();
    
    const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
    const testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;
    const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
    
    const spotsLeft = open ? Number.POSITIVE_INFINITY : Math.max(0, capacity - testerCount);
    
    // Ensure doc is initialized
    if (!metaSnap.exists) {
      await metaRef.set({ capacity, testerCount, open, updatedAt: new Date() }, { merge: true });
    }
    
    return {
      success: true,
      capacity,
      testerCount,
      spotsLeft,
      open
    };
  } catch (error) {
    console.error('Error getting beta spots count:', error);
    return {
      success: false,
      error: 'Failed to get beta spots count'
    };
  }
});

// Function to register a user for beta testing
export const registerBetaUser = onCall(async (request) => {
  try {
    const {uid, email} = request.data;
    
    if (!uid || !email) {
      return {
        success: false,
        error: 'Missing uid or email'
      };
    }
    
    const db = getFirestore();
    
    // Check if user is already registered
    const userRef = db.doc(`beta-users/${uid}`);
    const userSnap = await userRef.get();
    
    if (userSnap.exists) {
      return {
        success: false,
        error: 'User already registered for beta'
      };
    }
    
    // Get current beta stats
    const metaRef = db.doc('meta/beta');
    const metaSnap = await metaRef.get();
    
    const capacity = (metaSnap.exists && typeof metaSnap.get('capacity') === 'number') ? (metaSnap.get('capacity') as number) : 100;
    const testerCount = (metaSnap.exists && typeof metaSnap.get('testerCount') === 'number') ? (metaSnap.get('testerCount') as number) : 0;
    const open = (metaSnap.exists && typeof metaSnap.get('open') === 'boolean') ? (metaSnap.get('open') as boolean) : false;
    
    // Check if beta is full
    if (!open && testerCount >= capacity) {
      return {
        success: false,
        error: 'Beta is full'
      };
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
    
    return {
      success: true,
      message: 'Successfully registered for beta',
      remainingSpots: Math.max(0, capacity - (testerCount + 1))
    };
  } catch (error) {
    console.error('Error registering beta user:', error);
    return {
      success: false,
      error: 'Failed to register for beta'
    };
  }
});

// Example function (commented out for now)
// export const helloWorld = onRequest((request, response) => {
//   response.send("Hello from Firebase!");
// });
