const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper function to convert created_at to milliseconds
 * Handles both Firestore Timestamp and number (for backward compatibility)
 */
function getCreatedAtMillis(createdAt) {
  if (!createdAt) {
    return null;
  }
  
  // If it's a Firestore Timestamp
  if (createdAt.toMillis && typeof createdAt.toMillis === 'function') {
    return createdAt.toMillis();
  }
  
  // If it's already a number (milliseconds) - backward compatibility
  if (typeof createdAt === 'number') {
    return createdAt;
  }
  
  // If it's a Firestore Timestamp object (seconds/nanoseconds)
  if (createdAt.seconds !== undefined) {
    return createdAt.seconds * 1000 + (createdAt.nanoseconds || 0) / 1000000;
  }
  
  return null;
}

/**
 * Scheduled function to automatically delete rooms older than 1.5 hours
 * Runs every 30 minutes to check for and delete old rooms
 * This is a true backup cleanup that works even when no clients are connected
 * 
 * Note: Uses Admin SDK which bypasses Firestore Security Rules
 */
exports.cleanupOldRooms = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    const startTime = admin.firestore.Timestamp.now();
    const startTimeMillis = startTime.toMillis();
    const oneAndHalfHoursAgo = startTimeMillis - (1.5 * 60 * 60 * 1000); // 1.5 hours in milliseconds
    
    console.log(`🧹 Starting scheduled room cleanup at ${startTime.toDate().toISOString()}...`);
    console.log(`📅 Looking for rooms created before ${new Date(oneAndHalfHoursAgo).toISOString()}`);
    
    const roomCollections = [
      'GameRoom',
      'CodenamesRoom',
      'DrawRoom',
      'SpyRoom',
      'FrequencyRoom'
    ];
    
    let totalDeleted = 0;
    let totalChecked = 0;
    let totalMissingCreatedAt = 0;
    
    for (const collectionName of roomCollections) {
      try {
        console.log(`📋 Checking ${collectionName} for old rooms...`);
        
        // Fetch all rooms (Admin SDK bypasses rules, so we can read everything)
        const roomsSnapshot = await db.collection(collectionName).get();
        
        const deletions = [];
        
        roomsSnapshot.forEach((docSnapshot) => {
          const roomData = docSnapshot.data();
          const roomId = docSnapshot.id;
          
          totalChecked++;
          
          // Get created_at in milliseconds (handles both Timestamp and number)
          const createdAtMillis = getCreatedAtMillis(roomData.created_at);
          
          // Check if room should be deleted according to rules:
          // 1. Game is finished, OR
          // 2. Room is 1.5 hours old, OR
          // 3. Has deletion signal, OR
          // 4. Missing created_at (treat as deletable for safety)
          let shouldDelete = false;
          let deleteReason = '';
          
          if (roomData.game_status === 'finished') {
            shouldDelete = true;
            deleteReason = 'game finished';
          } else if (roomData.marked_for_deletion === true || roomData.should_delete === true) {
            shouldDelete = true;
            deleteReason = 'deletion signal';
          } else if (createdAtMillis === null) {
            // Missing created_at - treat as deletable for safety
            shouldDelete = true;
            deleteReason = 'missing created_at';
            totalMissingCreatedAt++;
          } else if (createdAtMillis <= oneAndHalfHoursAgo) {
            // Room is 1.5 hours old
            shouldDelete = true;
            deleteReason = 'age >= 1.5 hours';
          }
          
          if (shouldDelete) {
            const ageMinutes = createdAtMillis 
              ? Math.round((startTimeMillis - createdAtMillis) / 1000 / 60)
              : 'unknown';
            deletions.push({ 
              ref: docSnapshot.ref, 
              roomId, 
              age: ageMinutes,
              reason: deleteReason
            });
          }
        });
        
        // Process deletions in batches (Firestore batch limit is 500)
        const maxBatchSize = 500;
        for (let i = 0; i < deletions.length; i += maxBatchSize) {
          const batch = db.batch();
          const batchDeletions = deletions.slice(i, i + maxBatchSize);
          
          batchDeletions.forEach(({ ref, roomId, age, reason }) => {
            batch.delete(ref);
            totalDeleted++;
            console.log(`🗑️ [${collectionName}] Deleting room ${roomId} (age: ${age} minutes, reason: ${reason})`);
          });
          
          await batch.commit();
          console.log(`✅ Committed batch ${Math.floor(i / maxBatchSize) + 1} for ${collectionName} (${batchDeletions.length} rooms)`);
        }
        
        if (deletions.length > 0) {
          console.log(`✅ Deleted ${deletions.length} old rooms from ${collectionName}`);
        } else {
          console.log(`ℹ️ No old rooms to delete in ${collectionName}`);
        }
        
      } catch (error) {
        console.error(`❌ Error cleaning up ${collectionName}:`, error);
        console.error(`   Error details:`, error.message, error.stack);
        // Continue with other collections even if one fails
      }
    }
    
    const endTime = admin.firestore.Timestamp.now();
    const duration = (endTime.toMillis() - startTimeMillis) / 1000;
    
    console.log(`✅ Cleanup complete:`);
    console.log(`   - Checked: ${totalChecked} rooms`);
    console.log(`   - Deleted: ${totalDeleted} rooms`);
    console.log(`   - Missing created_at: ${totalMissingCreatedAt} rooms`);
    console.log(`   - Duration: ${duration.toFixed(2)}s`);
    
    return null;
  });


