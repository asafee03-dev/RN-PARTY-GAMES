# Cloud Functions for Room Cleanup

This directory contains Cloud Functions for automatic room cleanup.

## Function: `cleanupOldRooms`

A scheduled function that runs every 30 minutes to automatically delete rooms older than 1.5 hours. This provides a true backup cleanup mechanism that works even when no clients are connected.

### What it does:

1. Checks all room collections (GameRoom, CodenamesRoom, DrawRoom, SpyRoom, FrequencyRoom)
2. Identifies rooms that should be deleted based on:
   - Game status is 'finished', OR
   - Room is 1.5 hours old, OR
   - Room has deletion signal (`marked_for_deletion` or `should_delete` set to true)
3. Deletes matching rooms in batches

### Deployment

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Deploy the function:
   ```bash
   firebase deploy --only functions
   ```

   Or deploy everything (functions + rules):
   ```bash
   firebase deploy
   ```

### Testing Locally

To test the function locally using the Firebase emulator:

```bash
npm run serve
```

### Monitoring

View function logs:
```bash
firebase functions:log
```

Or check the Firebase Console → Functions → Logs

### Schedule

The function runs every 30 minutes (UTC timezone). You can modify the schedule in `index.js`:

```javascript
.schedule('every 30 minutes')  // Change to 'every 1 hours', 'every 15 minutes', etc.
```

### Cost Considerations

- Cloud Functions have a free tier (2 million invocations/month)
- Scheduled functions count as invocations
- Running every 30 minutes = ~1,440 invocations/day = ~43,200/month (well within free tier)
- Firestore reads/writes are also within free tier for typical usage

