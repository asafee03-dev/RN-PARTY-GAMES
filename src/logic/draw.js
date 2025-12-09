/**
 * Draw Game Logic
 * Pure functions for game flow, scoring, rounds, validation, and turn logic
 * No JSX, DOM, CSS, window, or document dependencies
 */

const WINNING_SCORE = 12;
const ROUND_DURATION = 60; // seconds

/**
 * Initialize a new game
 * @param {Array} players - Array of player objects with { name, score: 0 }
 * @returns {Object} Initial game state
 */
export function initializeGame(players) {
  if (!players || players.length < 2) {
    throw new Error('Need at least 2 players');
  }

  return {
    players: players.map(p => ({
      name: p.name,
      score: 0,
      currentGuess: '',
      hasSubmitted: false
    })),
    currentTurnIndex: 0,
    gameStatus: 'lobby', // 'lobby' | 'playing' | 'finished'
    currentWord: null,
    drawingData: null,
    allGuesses: [],
    turnStartTime: null,
    showRoundSummary: false,
    roundWinner: null,
    winnerName: null
  };
}

/**
 * Start a new game
 * @param {Object} gameState - Current game state
 * @param {string} word - Word to draw
 * @returns {Object} Updated game state
 */
export function startGame(gameState, word) {
  if (gameState.gameStatus !== 'lobby') {
    throw new Error('Game must be in lobby status');
  }

  if (!word || typeof word !== 'string') {
    throw new Error('Invalid word');
  }

  // Reset players submission status
  const resetPlayers = gameState.players.map(p => ({
    ...p,
    currentGuess: '',
    hasSubmitted: false
  }));

  return {
    ...gameState,
    gameStatus: 'playing',
    currentTurnIndex: 0,
    currentWord: word,
    drawingData: null,
    players: resetPlayers,
    allGuesses: [],
    turnStartTime: Date.now(),
    showRoundSummary: false,
    roundWinner: null
  };
}

/**
 * Submit a guess
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player submitting guess
 * @param {string} guess - Guess text
 * @returns {Object} Updated game state
 */
export function submitGuess(gameState, playerName, guess) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  if (gameState.showRoundSummary) {
    throw new Error('Round summary is already shown');
  }

  const currentDrawer = gameState.players[gameState.currentTurnIndex]?.name;
  if (playerName === currentDrawer) {
    throw new Error('Drawer cannot submit a guess');
  }

  if (!guess || typeof guess !== 'string' || !guess.trim()) {
    throw new Error('Invalid guess');
  }

  const normalizedWord = gameState.currentWord?.toLowerCase().trim();
  const normalizedGuess = guess.toLowerCase().trim();
  const isCorrect = normalizedWord && normalizedGuess === normalizedWord;

  const newGuess = {
    playerName,
    guess: guess.trim(),
    timestamp: Date.now(),
    isCorrect
  };

  const updatedGuesses = [...gameState.allGuesses, newGuess];

  // Check if timer expired
  const elapsed = gameState.turnStartTime ? Math.floor((Date.now() - gameState.turnStartTime) / 1000) : 0;
  const timerExpired = elapsed >= ROUND_DURATION;

  // Round ends if timer expired OR someone submitted a correct guess
  const shouldEndRound = timerExpired || isCorrect;

  if (shouldEndRound) {
    return calculateRoundEnd(gameState, updatedGuesses, currentDrawer);
  }

  return {
    ...gameState,
    allGuesses: updatedGuesses
  };
}

/**
 * Calculate points based on time elapsed
 * @param {number} timestamp - Timestamp of the guess
 * @param {number} turnStartTime - Timestamp when turn started
 * @returns {number} Points earned (3, 2, or 1)
 */
export function calculatePointsByTime(timestamp, turnStartTime) {
  if (!timestamp || !turnStartTime) return 1;
  
  const elapsed = Math.floor((timestamp - turnStartTime) / 1000);
  
  // First 20 seconds: 3 points
  if (elapsed <= 20) {
    return 3;
  }
  // Second 20 seconds (21-40): 2 points
  if (elapsed <= 40) {
    return 2;
  }
  // Last 20 seconds (41-60): 1 point
  return 1;
}

/**
 * Calculate round end and scores
 * @param {Object} gameState - Current game state
 * @param {Array} guesses - All guesses for the round
 * @param {string} currentDrawer - Name of current drawer
 * @param {Object} options - Options { drinkingMode: boolean }
 * @returns {Object} Updated game state
 */
export function calculateRoundEnd(gameState, guesses, currentDrawer, options = {}) {
  const { drinkingMode = false } = options;

  // Find all players who guessed correctly and calculate their points
  const correctGuessers = new Map(); // Map of playerName -> points earned
  let firstWinner = null;

  guesses.forEach(g => {
    if (g.isCorrect && g.timestamp) {
      const points = calculatePointsByTime(g.timestamp, gameState.turnStartTime);
      // If player already guessed correctly, take the highest points
      if (!correctGuessers.has(g.playerName) || correctGuessers.get(g.playerName) < points) {
        correctGuessers.set(g.playerName, points);
      }
      if (!firstWinner) {
        firstWinner = g.playerName;
      }
    }
  });

  const hasCorrectGuess = correctGuessers.size > 0;
  const drinkingPlayers = [];

  // Calculate scores
  const playersWithScores = gameState.players.map(player => {
    if (player.name === currentDrawer) {
      // Drawer gets 1 point if someone guessed correctly
      return {
        ...player,
        score: player.score + (hasCorrectGuess ? 1 : 0)
      };
    }

    // Check if this player has any correct guesses and add points based on time
    if (correctGuessers.has(player.name)) {
      const pointsEarned = correctGuessers.get(player.name);
      return { ...player, score: player.score + pointsEarned };
    }

    if (drinkingMode && !correctGuessers.has(player.name)) {
      drinkingPlayers.push(player.name);
    }

    return player;
  });

  // Check for game winner
  const winner = playersWithScores.find(p => p.score >= WINNING_SCORE);

  return {
    ...gameState,
    players: playersWithScores,
    allGuesses: guesses,
    showRoundSummary: true,
    roundWinner: firstWinner,
    drinkingPlayers: drinkingMode && drinkingPlayers.length > 0 ? drinkingPlayers : null,
    gameStatus: winner ? 'finished' : gameState.gameStatus,
    winnerName: winner ? winner.name : null
  };
}

/**
 * Continue to next round
 * @param {Object} gameState - Current game state
 * @param {string} nextWord - Next word to draw
 * @returns {Object} Updated game state
 */
export function continueToNextRound(gameState, nextWord) {
  if (!gameState.showRoundSummary) {
    throw new Error('Round summary must be shown');
  }

  if (gameState.gameStatus === 'finished') {
    return gameState; // Game already finished
  }

  if (!nextWord || typeof nextWord !== 'string') {
    throw new Error('Invalid next word');
  }

  // Calculate next turn index
  let nextTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
  let attempts = 0;
  while (attempts < gameState.players.length && 
         (!gameState.players[nextTurnIndex] || !gameState.players[nextTurnIndex].name)) {
    nextTurnIndex = (nextTurnIndex + 1) % gameState.players.length;
    attempts++;
  }
  if (attempts >= gameState.players.length) {
    nextTurnIndex = gameState.currentTurnIndex;
  }

  // Reset players submission status
  const resetPlayers = gameState.players.map(p => ({
    ...p,
    currentGuess: '',
    hasSubmitted: false
  }));

  return {
    ...gameState,
    currentTurnIndex: nextTurnIndex,
    currentWord: nextWord,
    drawingData: null,
    showRoundSummary: false,
    roundWinner: null,
    drinkingPlayers: null,
    allGuesses: [],
    turnStartTime: Date.now()
  };
}

/**
 * Update drawing data
 * @param {Object} gameState - Current game state
 * @param {string|Array} drawingData - Drawing data (JSON string or array)
 * @returns {Object} Updated game state
 */
export function updateDrawingData(gameState, drawingData) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  return {
    ...gameState,
    drawingData: typeof drawingData === 'string' ? drawingData : JSON.stringify(drawingData)
  };
}

/**
 * Handle timer expiration
 * @param {Object} gameState - Current game state
 * @param {Object} options - Options { drinkingMode: boolean }
 * @returns {Object} Updated game state
 */
export function handleTimerExpiration(gameState, options = {}) {
  if (gameState.gameStatus !== 'playing') {
    return gameState;
  }

  if (gameState.showRoundSummary) {
    return gameState; // Already handled
  }

  const currentDrawer = gameState.players[gameState.currentTurnIndex]?.name;
  return calculateRoundEnd(gameState, gameState.allGuesses, currentDrawer, options);
}

/**
 * Check if it's a player's turn
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {boolean} Whether it's the player's turn
 */
export function isPlayerTurn(gameState, playerName) {
  if (!gameState.players || gameState.players.length === 0) {
    return false;
  }

  return gameState.players[gameState.currentTurnIndex]?.name === playerName;
}

/**
 * Get current player name
 * @param {Object} gameState - Current game state
 * @returns {string} Current player name
 */
export function getCurrentPlayerName(gameState) {
  if (!gameState.players || gameState.players.length === 0) {
    return '';
  }

  return gameState.players[gameState.currentTurnIndex]?.name || '';
}

/**
 * Get all guesses
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of guess objects
 */
export function getAllGuesses(gameState) {
  if (!gameState.allGuesses || !Array.isArray(gameState.allGuesses)) {
    return [];
  }
  return gameState.allGuesses;
}

/**
 * Get correct guessers
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of player names who guessed correctly
 */
export function getCorrectGuessers(gameState) {
  const guesses = getAllGuesses(gameState);
  const correctGuesserNames = new Set(
    guesses.filter(g => g.isCorrect).map(g => g.playerName)
  );
  return Array.from(correctGuesserNames)
    .map(name => gameState.players.find(p => p.name === name))
    .filter(Boolean);
}

/**
 * Check if timer expired
 * @param {Object} gameState - Current game state
 * @returns {boolean} Whether timer expired
 */
export function isTimerExpired(gameState) {
  if (!gameState.turnStartTime) {
    return false;
  }

  const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
  return elapsed >= ROUND_DURATION;
}

/**
 * Get time remaining
 * @param {Object} gameState - Current game state
 * @returns {number} Time remaining in seconds
 */
export function getTimeRemaining(gameState) {
  if (!gameState.turnStartTime) {
    return ROUND_DURATION;
  }

  const elapsed = Math.floor((Date.now() - gameState.turnStartTime) / 1000);
  return Math.max(0, ROUND_DURATION - elapsed);
}

/**
 * Validate game state
 * @param {Object} gameState - Game state to validate
 * @returns {Object} Validation result { valid: boolean, errors: Array<string> }
 */
export function validateGameState(gameState) {
  const errors = [];

  if (!gameState.players || !Array.isArray(gameState.players)) {
    errors.push('Players must be an array');
  } else {
    if (gameState.players.length < 2) {
      errors.push('Need at least 2 players');
    }
    gameState.players.forEach((player, idx) => {
      if (!player.name) {
        errors.push(`Player ${idx} missing name`);
      }
      if (typeof player.score !== 'number' || player.score < 0) {
        errors.push(`Player ${idx} score must be a non-negative number`);
      }
    });
  }

  if (typeof gameState.currentTurnIndex !== 'number' || 
      gameState.currentTurnIndex < 0 || 
      gameState.currentTurnIndex >= (gameState.players?.length || 0)) {
    errors.push('Invalid current turn index');
  }

  if (!['lobby', 'playing', 'finished'].includes(gameState.gameStatus)) {
    errors.push('Invalid game status');
  }

  if (gameState.gameStatus === 'playing') {
    if (!gameState.currentWord || typeof gameState.currentWord !== 'string') {
      errors.push('Missing or invalid current word');
    }
    if (!gameState.turnStartTime || typeof gameState.turnStartTime !== 'number') {
      errors.push('Missing or invalid turn start time');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Reset game
 * @param {Object} gameState - Current game state
 * @returns {Object} Reset game state
 */
export function resetGame(gameState) {
  return {
    ...gameState,
    players: gameState.players.map(p => ({
      ...p,
      score: 0,
      currentGuess: '',
      hasSubmitted: false
    })),
    gameStatus: 'lobby',
    currentTurnIndex: 0,
    currentWord: null,
    drawingData: null,
    allGuesses: [],
    turnStartTime: null,
    showRoundSummary: false,
    roundWinner: null,
    winnerName: null,
    drinkingPlayers: null
  };
}

