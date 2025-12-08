/**
 * Frequency Game Logic
 * Pure functions for game flow, scoring, rounds, validation, and turn logic
 * No JSX, DOM, CSS, window, or document dependencies
 */

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
      hasGuessed: false
    })),
    currentTurnIndex: 0,
    gameStatus: 'lobby', // 'lobby' | 'playing' | 'finished'
    currentTopic: null,
    targetPosition: null,
    currentRoundSectors: null,
    turnPhase: null, // 'clue' | 'guessing' | 'summary'
    needlePositions: {},
    guessSubmittedNames: {},
    winnerName: null
  };
}

/**
 * Calculate sectors for a round
 * @returns {Array} Array of sector objects with { id, start, end, points }
 */
export function calculateSectors() {
  const twoPointWidth = 10;
  const onePointWidth = 10;
  
  const minCenter = onePointWidth + twoPointWidth / 2;
  const maxCenter = 180 - onePointWidth - twoPointWidth / 2;
  const centerPos = Math.random() * (maxCenter - minCenter) + minCenter;
  
  return [
    { 
      id: 'left', 
      start: centerPos - twoPointWidth / 2 - onePointWidth, 
      end: centerPos - twoPointWidth / 2, 
      points: 1 
    },
    { 
      id: 'center', 
      start: centerPos - twoPointWidth / 2, 
      end: centerPos + twoPointWidth / 2, 
      points: 2 
    },
    { 
      id: 'right', 
      start: centerPos + twoPointWidth / 2, 
      end: centerPos + twoPointWidth / 2 + onePointWidth, 
      points: 1 
    }
  ];
}

/**
 * Get sector score for a guess angle
 * @param {number} guessAngle - Angle of the guess (0-180)
 * @param {Array} sectors - Array of sector objects
 * @returns {number} Points earned (0, 1, or 2)
 */
export function getSectorScore(guessAngle, sectors) {
  if (typeof guessAngle !== 'number' || guessAngle < 0 || guessAngle > 180) {
    return 0;
  }

  for (const sector of sectors) {
    if (guessAngle >= sector.start && guessAngle <= sector.end) {
      return sector.points;
    }
  }
  return 0;
}

/**
 * Start a new game
 * @param {Object} gameState - Current game state
 * @param {Object} topic - Topic object with { left, right }
 * @returns {Object} Updated game state
 */
export function startGame(gameState, topic) {
  if (gameState.gameStatus !== 'lobby') {
    throw new Error('Game must be in lobby status');
  }

  if (!topic || !topic.left || !topic.right) {
    throw new Error('Invalid topic');
  }

  const randomTarget = Math.floor(Math.random() * 180);
  const sectors = calculateSectors();

  return {
    ...gameState,
    gameStatus: 'playing',
    currentTopic: { leftSide: topic.left, rightSide: topic.right },
    targetPosition: randomTarget,
    currentRoundSectors: sectors,
    turnPhase: 'clue',
    guessSubmittedNames: {},
    needlePositions: {}
  };
}

/**
 * Start guessing phase
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export function startGuessing(gameState) {
  if (gameState.gameStatus !== 'playing' || gameState.turnPhase !== 'clue') {
    throw new Error('Game must be in playing status and clue phase');
  }

  return {
    ...gameState,
    turnPhase: 'guessing'
  };
}

/**
 * Submit a guess
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player submitting guess
 * @param {number} angle - Guess angle (0-180)
 * @returns {Object} Updated game state
 */
export function submitGuess(gameState, playerName, angle) {
  if (gameState.gameStatus !== 'playing' || gameState.turnPhase !== 'guessing') {
    throw new Error('Game must be in playing status and guessing phase');
  }

  const clueGiver = gameState.players[gameState.currentTurnIndex]?.name;
  if (playerName === clueGiver) {
    throw new Error('Clue giver cannot submit a guess');
  }

  if (hasPlayerSubmittedGuess(gameState, playerName)) {
    throw new Error('Player already submitted guess');
  }

  const updatedNeedlePositions = {
    ...gameState.needlePositions,
    [playerName]: angle
  };

  const updatedGuessSubmittedNames = {
    ...gameState.guessSubmittedNames,
    [playerName]: true
  };

  // Check if all players have guessed
  const activePlayers = gameState.players || [];
  const activeGuessers = activePlayers.filter(p => p.name !== clueGiver);
  const allGuessed = getGuessSubmittedCount({ guessSubmittedNames: updatedGuessSubmittedNames }) === activeGuessers.length;

  if (allGuessed) {
    // Calculate scores for summary
    const guessesSummary = activeGuessers.map(player => {
      const playerAngle = updatedNeedlePositions[player.name];
      return {
        playerName: player.name,
        guessAngle: playerAngle ?? null,
        pointsEarned: playerAngle !== undefined ? getSectorScore(playerAngle, gameState.currentRoundSectors) : 0
      };
    });

    return {
      ...gameState,
      needlePositions: updatedNeedlePositions,
      guessSubmittedNames: updatedGuessSubmittedNames,
      turnPhase: 'summary',
      lastGuessResult: {
        type: 'round_summary',
        targetAngle: gameState.targetPosition,
        sectors: gameState.currentRoundSectors,
        guesses: guessesSummary,
        clueGiver: clueGiver,
        showPopup: true
      }
    };
  }

  return {
    ...gameState,
    needlePositions: updatedNeedlePositions,
    guessSubmittedNames: updatedGuessSubmittedNames
  };
}

/**
 * Advance to next turn
 * @param {Object} gameState - Current game state
 * @param {Object} nextTopic - Next topic object with { left, right }
 * @param {Object} options - Options { drinkingMode: boolean }
 * @returns {Object} Updated game state
 */
export function advanceToNextTurn(gameState, nextTopic, options = {}) {
  if (gameState.turnPhase !== 'summary') {
    throw new Error('Must be in summary phase');
  }

  const { drinkingMode = false } = options;
  const sectors = gameState.currentRoundSectors;
  const currentClueGiver = gameState.players[gameState.currentTurnIndex]?.name;
  
  // Calculate and apply scores
  let totalPointsEarnedByGuessers = 0;
  const drinkingPlayers = [];

  const updatedPlayers = gameState.players.map(player => {
    if (player.name === currentClueGiver) {
      return player; // Don't update clue giver yet
    }

    const angle = gameState.needlePositions[player.name];
    const pointsEarned = angle !== undefined ? getSectorScore(angle, sectors) : 0;
    totalPointsEarnedByGuessers += pointsEarned;

    if (drinkingMode && pointsEarned === 0) {
      drinkingPlayers.push(player.name);
    }

    return {
      ...player,
      score: player.score + pointsEarned
    };
  });

  // Calculate clue giver points: totalPointsEarnedByAllGuessers / 2
  const clueGiverPoints = totalPointsEarnedByGuessers / 2;
  const finalUpdatedPlayers = updatedPlayers.map(player => {
    if (player.name === currentClueGiver) {
      return {
        ...player,
        score: player.score + clueGiverPoints
      };
    }
    return player;
  });

  // Check for winner
  const winner = finalUpdatedPlayers.find(p => p.score >= 10);

  if (winner) {
    return {
      ...gameState,
      players: finalUpdatedPlayers,
      gameStatus: 'finished',
      winnerName: winner.name,
      lastGuessResult: null,
      drinkingPlayers: drinkingPlayers.length > 0 ? drinkingPlayers : null
    };
  }

  // Calculate next turn index
  let nextTurnIndex = (gameState.currentTurnIndex + 1) % gameState.players.length;
  let attempts = 0;
  while (attempts < gameState.players.length && !gameState.players[nextTurnIndex]) {
    nextTurnIndex = (nextTurnIndex + 1) % gameState.players.length;
    attempts++;
  }
  if (attempts >= gameState.players.length) {
    nextTurnIndex = gameState.currentTurnIndex;
  }

  if (!nextTopic || !nextTopic.left || !nextTopic.right) {
    throw new Error('Invalid next topic');
  }

  const randomTarget = Math.floor(Math.random() * 180);
  const newSectors = calculateSectors();

  return {
    ...gameState,
    players: finalUpdatedPlayers,
    currentTurnIndex: nextTurnIndex,
    currentTopic: { leftSide: nextTopic.left, rightSide: nextTopic.right },
    targetPosition: randomTarget,
    needlePositions: {},
    guessSubmittedNames: {},
    currentRoundSectors: newSectors,
    turnPhase: 'clue',
    lastGuessResult: null,
    drinkingPlayers: drinkingPlayers.length > 0 ? drinkingPlayers : null
  };
}

/**
 * Check if player has submitted guess
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {boolean} Whether player submitted guess
 */
export function hasPlayerSubmittedGuess(gameState, playerName) {
  const names = getGuessSubmittedNames(gameState);
  return names[playerName] === true;
}

/**
 * Get guess submitted names object
 * @param {Object} gameState - Current game state
 * @returns {Object} Object with player names as keys
 */
export function getGuessSubmittedNames(gameState) {
  if (!gameState) return {};
  if (typeof gameState.guessSubmittedNames === 'object' && 
      gameState.guessSubmittedNames !== null && 
      !Array.isArray(gameState.guessSubmittedNames)) {
    return gameState.guessSubmittedNames;
  }
  return {};
}

/**
 * Get count of submitted guesses
 * @param {Object} gameState - Current game state
 * @returns {number} Number of players who submitted guesses
 */
export function getGuessSubmittedCount(gameState) {
  const names = getGuessSubmittedNames(gameState);
  return Object.keys(names).length;
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
 * Check if all players have guessed
 * @param {Object} gameState - Current game state
 * @returns {boolean} Whether all players have guessed
 */
export function allPlayersGuessed(gameState) {
  if (!gameState.players || gameState.players.length === 0) {
    return false;
  }

  const clueGiver = gameState.players[gameState.currentTurnIndex]?.name;
  const activeGuessers = gameState.players.filter(p => p.name !== clueGiver);
  return getGuessSubmittedCount(gameState) === activeGuessers.length;
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
    if (!gameState.currentTopic || !gameState.currentTopic.leftSide || !gameState.currentTopic.rightSide) {
      errors.push('Missing or invalid current topic');
    }
    if (typeof gameState.targetPosition !== 'number' || 
        gameState.targetPosition < 0 || 
        gameState.targetPosition > 180) {
      errors.push('Invalid target position');
    }
    if (!gameState.currentRoundSectors || !Array.isArray(gameState.currentRoundSectors)) {
      errors.push('Missing or invalid sectors');
    }
    if (!['clue', 'guessing', 'summary'].includes(gameState.turnPhase)) {
      errors.push('Invalid turn phase');
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
      hasGuessed: false
    })),
    gameStatus: 'lobby',
    currentTurnIndex: 0,
    needlePositions: {},
    guessSubmittedNames: {},
    currentTopic: null,
    targetPosition: null,
    currentRoundSectors: null,
    turnPhase: null,
    lastGuessResult: null,
    winnerName: null,
    drinkingPlayers: null
  };
}

