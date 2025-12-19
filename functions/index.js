const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled function to automatically delete rooms older than 1.5 hours
 * Runs every 30 minutes to check for and delete old rooms
 * This is a true backup cleanup that works even when no clients are connected
 */
exports.cleanupOldRooms = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🧹 Starting scheduled room cleanup...');
    
    const oneAndHalfHoursAgo = Date.now() - (1.5 * 60 * 60 * 1000); // 1.5 hours in milliseconds
    const roomCollections = [
      'GameRoom',
      'CodenamesRoom',
      'DrawRoom',
      'SpyRoom',
      'FrequencyRoom'
    ];
    
    let totalDeleted = 0;
    let totalChecked = 0;
    
    for (const collectionName of roomCollections) {
      try {
        console.log(`📋 Checking ${collectionName} for old rooms...`);
        
        // Query rooms with created_at older than 1.5 hours
        // Note: created_at is stored as a number (Date.now()), so we can query it
        // However, to be safe and handle edge cases, we'll fetch all rooms and filter
        // For large collections, consider adding an index or using pagination
        const roomsSnapshot = await db.collection(collectionName)
          .get();
        
        const deletions = [];
        
        roomsSnapshot.forEach((docSnapshot) => {
          const roomData = docSnapshot.data();
          const roomId = docSnapshot.id;
          
          totalChecked++;
          
          // Check if room should be deleted according to rules:
          // 1. Game is finished, OR
          // 2. Room is 1.5 hours old, OR
          // 3. Has deletion signal
          const shouldDelete = 
            roomData.game_status === 'finished' ||
            (roomData.created_at && (Date.now() - roomData.created_at) >= (1.5 * 60 * 60 * 1000)) ||
            roomData.marked_for_deletion === true ||
            roomData.should_delete === true;
          
          if (shouldDelete) {
            deletions.push({ ref: docSnapshot.ref, roomId, age: roomData.created_at ? Math.round((Date.now() - roomData.created_at) / 1000 / 60) : 'unknown' });
          }
        });
        
        // Process deletions in batches (Firestore batch limit is 500)
        const maxBatchSize = 500;
        for (let i = 0; i < deletions.length; i += maxBatchSize) {
          const batch = db.batch();
          const batchDeletions = deletions.slice(i, i + maxBatchSize);
          
          batchDeletions.forEach(({ ref, roomId, age }) => {
            batch.delete(ref);
            totalDeleted++;
            console.log(`🗑️ Marked ${collectionName}/${roomId} for deletion (age: ${age} minutes)`);
          });
          
          await batch.commit();
        }
        
        if (deletions.length > 0) {
          console.log(`✅ Deleted ${deletions.length} old rooms from ${collectionName}`);
        } else {
          console.log(`ℹ️ No old rooms to delete in ${collectionName}`);
        }
        
      } catch (error) {
        console.error(`❌ Error cleaning up ${collectionName}:`, error);
        // Continue with other collections even if one fails
      }
    }
    
    console.log(`✅ Cleanup complete: Checked ${totalChecked} rooms, deleted ${totalDeleted} old rooms`);
    return null;
  });

/**
 * Alternative approach: Query all rooms and filter by age
 * This is less efficient but more reliable if the query above doesn't work
 * Uncomment and use if the scheduled function above has issues
 */
/*
exports.cleanupOldRoomsAlternative = functions.pubsub
  .schedule('every 30 minutes')
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🧹 Starting scheduled room cleanup (alternative method)...');
    
    const oneAndHalfHoursAgo = Date.now() - (1.5 * 60 * 60 * 1000);
    const roomCollections = [
      'GameRoom',
      'CodenamesRoom',
      'DrawRoom',
      'SpyRoom',
      'FrequencyRoom'
    ];
    
    let totalDeleted = 0;
    
    for (const collectionName of roomCollections) {
      try {
        const roomsSnapshot = await db.collection(collectionName).get();
        const batch = db.batch();
        let batchCount = 0;
        
        roomsSnapshot.forEach((docSnapshot) => {
          const roomData = docSnapshot.data();
          
          if (roomData.created_at && roomData.created_at <= oneAndHalfHoursAgo) {
            const shouldDelete = 
              roomData.game_status === 'finished' ||
              (Date.now() - roomData.created_at) >= (1.5 * 60 * 60 * 1000) ||
              roomData.marked_for_deletion === true ||
              roomData.should_delete === true;
            
            if (shouldDelete) {
              batch.delete(docSnapshot.ref);
              batchCount++;
              totalDeleted++;
            }
          }
        });
        
        if (batchCount > 0) {
          await batch.commit();
        }
      } catch (error) {
        console.error(`❌ Error cleaning up ${collectionName}:`, error);
      }
    }
    
    console.log(`✅ Cleanup complete: Deleted ${totalDeleted} old rooms`);
    return null;
  });
*/

