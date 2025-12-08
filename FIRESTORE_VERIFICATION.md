# Firestore Collections and Fields Verification

## Collections Used

### 1. GameRoom (Alias Game)
- **Document ID**: Room code (string)
- **Fields**:
  - `room_code` (string)
  - `host_name` (string)
  - `teams` (array of team objects)
  - `game_status` (string: 'setup', 'waiting', 'playing', 'finished')
  - `current_turn` (number)
  - `round_active` (boolean)
  - `current_round_score` (number)
  - `golden_rounds_enabled` (boolean)
  - `golden_squares` (array of numbers)
  - `used_cards` (array)
  - `current_card_index` (number)
  - `round_start_time` (timestamp)
  - `winner_team` (string, nullable)
  - `current_word_is_golden` (boolean)
  - `created_at` (timestamp)

### 2. CodenamesRoom (Codenames Game)
- **Document ID**: Room code (string)
- **Fields**:
  - `room_code` (string)
  - `host_name` (string)
  - `game_mode` (string: 'friends', 'rivals')
  - `red_team` (object: { spymaster, guessers, revealed_words })
  - `blue_team` (object: { spymaster, guessers, revealed_words })
  - `game_status` (string: 'setup', 'playing', 'finished')
  - `current_turn` (string: 'red', 'blue')
  - `starting_team` (string: 'red', 'blue')
  - `board_words` (array of strings)
  - `key_map` (array of strings: 'red', 'blue', 'neutral', 'black')
  - `guesses_remaining` (number)
  - `turn_phase` (string: 'clue', 'guess')
  - `current_clue` (object: { number }, nullable)
  - `turn_start_time` (timestamp, nullable)
  - `winner_team` (string, nullable)
  - `drinking_popup` (object, nullable)
  - `round_baseline_reveals` (object: { red, blue }, nullable)

### 3. DrawRoom (Draw Game)
- **Document ID**: Room code (string)
- **Fields**:
  - `room_code` (string)
  - `host_name` (string)
  - `players` (array of player objects)
  - `game_status` (string: 'lobby', 'playing', 'round_summary', 'finished')
  - `current_round` (number)
  - `current_turn_index` (number)
  - `current_word` (string, nullable)
  - `current_drawer` (string, nullable)
  - `round_start_time` (timestamp, nullable)
  - `drawing_data` (string, nullable - JSON)
  - `guesses` (array)
  - `scores` (object)
  - `winner` (string, nullable)
  - `drinking_popup` (object, nullable)

### 4. SpyRoom (Spy Game)
- **Document ID**: Room code (string)
- **Fields**:
  - `room_code` (string)
  - `host_name` (string)
  - `players` (array of player objects)
  - `game_status` (string: 'lobby', 'playing', 'finished')
  - `spy` (string, nullable)
  - `location` (string, nullable)
  - `locations` (array of location objects)
  - `votes` (object)
  - `game_start_time` (timestamp, nullable)
  - `winner` (string, nullable)
  - `drinking_popup` (object, nullable)

### 5. FrequencyRoom (Frequency Game)
- **Document ID**: Room code (string)
- **Fields**:
  - `room_code` (string)
  - `host_name` (string)
  - `players` (array of player objects)
  - `game_status` (string: 'lobby', 'playing', 'round_summary', 'finished')
  - `current_turn_index` (number)
  - `current_topic` (string, nullable)
  - `target_position` (number, nullable)
  - `needle_positions` (object)
  - `sectors` (array, nullable)
  - `round_start_time` (timestamp, nullable)
  - `guesses` (array)
  - `scores` (object)
  - `winner` (string, nullable)
  - `drinking_popup` (object, nullable)

### 6. WordCard (Word Cards for Alias/Codenames)
- **Document ID**: Auto-generated
- **Fields**:
  - `word` (string)

### 7. DrawWord (Words for Draw Game)
- **Document ID**: Auto-generated
- **Fields**:
  - `word` (string)

### 8. SpyLocation (Locations for Spy Game)
- **Document ID**: Auto-generated
- **Fields**:
  - `name` (string)

### 9. FrequencyTopic (Topics for Frequency Game)
- **Document ID**: Auto-generated
- **Fields**:
  - `topic` (string)

## Verification Status

✅ All collections match the Vite implementation
✅ All field names are consistent
✅ Document ID patterns are correct (room codes for rooms, auto-generated for reference data)
✅ Field types match expected types

## Notes

- All room collections use `room_code` as both document ID and a field
- Reference collections (WordCard, DrawWord, SpyLocation, FrequencyTopic) use auto-generated IDs
- All games support `drinking_popup` for drinking mode functionality
- Game status fields follow consistent patterns across all games

