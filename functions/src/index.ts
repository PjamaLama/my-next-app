import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// This function is scheduled to run every 24 hours.
export const resetDailyMessageCounts = onSchedule("every 24 hours", async (event) => {
  const usersRef = db.collection("users");
  // Get ALL users to reset their message counts daily
  const snapshot = await usersRef.get();

  if (snapshot.empty) {
    console.log("No users found to reset message counts.");
    return;
  }

  const batch = db.batch();
  snapshot.forEach((doc) => {
    // Update only the main user document (denormalized location)
    const userRef = usersRef.doc(doc.id);

    const resetData = {
      message_count: 0,
      last_reset: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Update main user document (denormalized)
    batch.set(userRef, resetData, { merge: true });
  });

  await batch.commit();

  console.log(`Reset message count for ${snapshot.size} users (main user documents only).`);
  return;
});