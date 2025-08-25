import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

// This function is scheduled to run every day at midnight (UTC).
export const resetDailyMessageCounts = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async (context) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usersRef = db.collection("users");
    // Query for users whose last_reset is before today.
    const snapshot = await usersRef.where("last_reset", "<", today).get();

    if (snapshot.empty) {
      console.log("No users needed a message count reset.");
      return null;
    }

    const batch = db.batch();
    snapshot.forEach((doc) => {
      const userRef = usersRef.doc(doc.id).collection("private").doc("profile");
      batch.update(userRef, {
        message_count: 0,
        last_reset: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    console.log(`Reset message count for ${snapshot.size} users.`);
    return null;
  });