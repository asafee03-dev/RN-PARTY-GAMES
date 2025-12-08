/**
 * Alias Game Logic
 * Pure functions for game flow, scoring, rounds, validation, and turn logic
 * No JSX, DOM, CSS, window, or document dependencies
 */

/**
 * Initialize a new game
 * @param {Array} teams - Array of team objects with { name, players: [], position: 0 }
 * @param {Object} options - Game options
 * @returns {Object} Initial game state
 */
export function initializeGame(teams, options = {}) {
  const {
    goldenRoundsEnabled = false,
    goldenSquares = [],
    roundDuration = 60
  } = options;

  return {
    teams: teams.map(team => ({
      ...team,
      position: 0
    })),
    currentTurn: 0,
    gameStatus: 'waiting', // 'waiting' | 'playing' | 'finished'
    roundActive: false,
    currentRoundScore: 0,
    roundStartTime: null,
    roundStartPosition: null,
    usedCards: [],
    showRoundSummary: false,
    lastWordOnTimeUp: null,
    currentWordIsGolden: false,
    winnerTeam: null,
    goldenRoundsEnabled,
    goldenSquares: goldenSquares || [],
    roundDuration
  };
}

/**
 * Generate cards from word list
 * @param {Array<string>} words - Array of words
 * @param {number} cardsCount - Number of cards to generate (default: 33)
 * @param {number} wordsPerCard - Words per card (default: 6)
 * @returns {Array<Array<string>>} Array of cards, each containing words
 */
export function generateCards(words, cardsCount = 33, wordsPerCard = 6) {
  if (words.length < cardsCount * wordsPerCard) {
    throw new Error(`Not enough words. Need at least ${cardsCount * wordsPerCard} words`);
  }

  const shuffled = [...words].sort(() => Math.random() - 0.5);
  const selectedWords = shuffled.slice(0, cardsCount * wordsPerCard);
  const cards = [];

  for (let i = 0; i < cardsCount; i++) {
    const cardWords = selectedWords.slice(i * wordsPerCard, i * wordsPerCard + wordsPerCard);
    if (cardWords.length === wordsPerCard) {
      cards.push(cardWords);
    }
  }

  return cards;
}

/**
 * Start a new round
 * @param {Object} gameState - Current game state
 * @param {Array<Array<string>>} cards - Cards to use
 * @returns {Object} Updated game state
 */
export function startRound(gameState, cards) {
  if (gameState.roundActive) {
    throw new Error('Round is already active');
  }

  if (!cards || cards.length === 0) {
    throw new Error('No cards provided');
  }

  const currentTeam = gameState.teams[gameState.currentTurn];
  if (!currentTeam) {
    throw new Error('Invalid current turn');
  }

  return {
    ...gameState,
    roundActive: true,
    gameStatus: 'playing',
    currentRoundScore: 0,
    roundStartTime: Date.now(),
    roundStartPosition: currentTeam.position,
    usedCards: [],
    showRoundSummary: false,
    lastWordOnTimeUp: null,
    currentWordIsGolden: gameState.goldenRoundsEnabled && 
                        gameState.goldenSquares.includes(currentTeam.position)
  };
}

/**
 * Get current word for a team
 * @param {Array<Array<string>>} cards - Cards array
 * @param {number} cardIndex - Current card index
 * @param {number} teamPosition - Team's current position
 * @returns {string} Current word to display
 */
export function getCurrentWord(cards, cardIndex, teamPosition) {
  if (!cards || cardIndex >= cards.length) {
    return null;
  }

  const cardWords = cards[cardIndex];
  if (!cardWords || cardWords.length === 0) {
    return null;
  }

  const wordIndex = teamPosition % cardWords.length;
  return cardWords[wordIndex];
}

/**
 * Handle correct guess
 * @param {Object} gameState - Current game state
 * @param {Array<Array<string>>} cards - Cards array
 * @param {number} cardIndex - Current card index
 * @param {number} teamIndex - Team that guessed (for golden words)
 * @param {boolean} isTimeUp - Whether time is up
 * @returns {Object} Updated game state
 */
export function handleCorrect(gameState, cards, cardIndex, teamIndex = null, isTimeUp = false) {
  if (!gameState.roundActive) {
    throw new Error('No active round');
  }

  const currentTeamIndex = teamIndex !== null ? teamIndex : gameState.currentTurn;
  const currentTeam = gameState.teams[currentTeamIndex];
  if (!currentTeam) {
    throw new Error('Invalid team index');
  }

  // Get word to use
  let wordToUse;
  if (isTimeUp && gameState.lastWordOnTimeUp) {
    wordToUse = typeof gameState.lastWordOnTimeUp === 'string' 
      ? [gameState.lastWordOnTimeUp] 
      : (Array.isArray(gameState.lastWordOnTimeUp) ? gameState.lastWordOnTimeUp : []);
  } else {
    const currentCard = cards[cardIndex];
    if (!currentCard) {
      throw new Error('Invalid card index');
    }
    wordToUse = currentCard;
  }

  const currentCard = {
    words: wordToUse,
    status: 'correct',
    cardNumber: cardIndex + 1,
    isLastWord: isTimeUp,
    isGoldenWord: gameState.currentWordIsGolden && !isTimeUp,
    teamThatGuessed: isTimeUp || gameState.currentWordIsGolden ? currentTeamIndex : null
  };

  const updatedUsedCards = [...gameState.usedCards, currentCard];
  const updatedTeams = gameState.teams.map((team, idx) => {
    if (idx === currentTeamIndex) {
      return {
        ...team,
        position: Math.min(59, team.position + 1)
      };
    }
    return team;
  });

  const updatedTeam = updatedTeams[currentTeamIndex];
  const correctCount = updatedUsedCards.filter(c => c.status === 'correct').length;

  let gameStatus = gameState.gameStatus;
  let winnerTeam = gameState.winnerTeam;

  // Check win condition
  if (updatedTeam.position >= 59) {
    gameStatus = 'finished';
    winnerTeam = updatedTeam.name;
  }

  // Check if next square is golden
  const isNextSquareGolden = gameState.goldenRoundsEnabled && 
                            gameState.goldenSquares.includes(updatedTeam.position);

  return {
    ...gameState,
    teams: updatedTeams,
    usedCards: updatedUsedCards,
    currentRoundScore: correctCount,
    gameStatus,
    winnerTeam,
    currentWordIsGolden: isNextSquareGolden,
    showRoundSummary: isTimeUp,
    roundActive: isTimeUp ? false : gameState.roundActive
  };
}

/**
 * Handle skip
 * @param {Object} gameState - Current game state
 * @param {Array<Array<string>>} cards - Cards array
 * @param {number} cardIndex - Current card index
 * @param {boolean} isTimeUp - Whether time is up
 * @returns {Object} Updated game state
 */
export function handleSkip(gameState, cards, cardIndex, isTimeUp = false) {
  if (!gameState.roundActive) {
    throw new Error('No active round');
  }

  let wordToUse;
  if (isTimeUp && gameState.lastWordOnTimeUp) {
    wordToUse = typeof gameState.lastWordOnTimeUp === 'string' 
      ? [gameState.lastWordOnTimeUp] 
      : (Array.isArray(gameState.lastWordOnTimeUp) ? gameState.lastWordOnTimeUp : []);
  } else {
    const currentCard = cards[cardIndex];
    if (!currentCard) {
      throw new Error('Invalid card index');
    }
    wordToUse = currentCard;
  }

  const currentCard = {
    words: wordToUse,
    status: 'skipped',
    cardNumber: cardIndex + 1,
    isLastWord: isTimeUp,
    teamThatGuessed: null
  };

  const updatedUsedCards = [...gameState.usedCards, currentCard];
  const updatedTeams = gameState.teams.map((team, idx) => {
    if (idx === gameState.currentTurn) {
      return {
        ...team,
        position: Math.max(0, team.position - 1)
      };
    }
    return team;
  });

  const correctCount = updatedUsedCards.filter(c => c.status === 'correct').length;

  return {
    ...gameState,
    teams: updatedTeams,
    usedCards: updatedUsedCards,
    currentRoundScore: correctCount,
    showRoundSummary: isTimeUp,
    roundActive: isTimeUp ? false : gameState.roundActive
  };
}

/**
 * Freeze word when timer expires
 * @param {Object} gameState - Current game state
 * @param {Array<Array<string>>} cards - Cards array
 * @param {number} cardIndex - Current card index
 * @returns {Object} Updated game state with frozen word
 */
export function freezeWordOnTimeUp(gameState, cards, cardIndex) {
  if (!gameState.roundActive) {
    throw new Error('No active round');
  }

  const currentTeam = gameState.teams[gameState.currentTurn];
  if (!currentTeam) {
    throw new Error('Invalid current turn');
  }

  const currentCard = cards[cardIndex];
  if (!currentCard || currentCard.length === 0) {
    throw new Error('Invalid card');
  }

  const teamPosition = currentTeam.position;
  const wordIndex = teamPosition % currentCard.length;
  const wordToFreeze = currentCard[wordIndex];

  return {
    ...gameState,
    lastWordOnTimeUp: wordToFreeze
  };
}

/**
 * Finish round and advance to next turn
 * @param {Object} gameState - Current game state
 * @param {Object} options - Options for finishing round
 * @returns {Object} Updated game state
 */
export function finishRound(gameState, options = {}) {
  if (!gameState.showRoundSummary) {
    throw new Error('Round summary must be shown before finishing');
  }

  const { drinkingMode = false } = options;
  const nextTurn = (gameState.currentTurn + 1) % gameState.teams.length;

  // Drinking mode: find team with minimum progress
  let drinkingTeam = null;
  if (drinkingMode && nextTurn === 0) {
    let minProgress = Infinity;
    let minTeamIndex = 0;

    gameState.teams.forEach((team, idx) => {
      if (team.position < minProgress) {
        minProgress = team.position;
        minTeamIndex = idx;
      }
    });

    drinkingTeam = gameState.teams[minTeamIndex].name;
  }

  return {
    ...gameState,
    currentTurn: nextTurn,
    roundActive: false,
    showRoundSummary: false,
    currentRoundScore: 0,
    usedCards: [],
    lastWordOnTimeUp: null,
    currentWordIsGolden: false,
    drinkingPopup: drinkingTeam ? { team: drinkingTeam } : null
  };
}

/**
 * Check if it's a player's turn
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {boolean} Whether it's the player's turn
 */
export function isPlayerTurn(gameState, playerName) {
  if (!gameState.teams || gameState.teams.length === 0) {
    return false;
  }

  const currentTeam = gameState.teams[gameState.currentTurn];
  if (!currentTeam) {
    return false;
  }

  return currentTeam.players && currentTeam.players.includes(playerName);
}

/**
 * Get current team
 * @param {Object} gameState - Current game state
 * @returns {Object|null} Current team object
 */
export function getCurrentTeam(gameState) {
  if (!gameState.teams || gameState.currentTurn >= gameState.teams.length) {
    return null;
  }

  return gameState.teams[gameState.currentTurn];
}

/**
 * Calculate progress for current team
 * @param {Object} gameState - Current game state
 * @returns {Object} Progress information
 */
export function calculateProgress(gameState) {
  const currentTeam = getCurrentTeam(gameState);
  if (!currentTeam) {
    return { startPos: 0, currentPos: 0, moved: 0 };
  }

  const startPos = gameState.roundStartPosition || currentTeam.position;
  const currentPos = currentTeam.position;
  const moved = currentPos - startPos;

  return { startPos, currentPos, moved };
}

/**
 * Get final rankings
 * @param {Object} gameState - Current game state
 * @returns {Array} Sorted teams by position
 */
export function getFinalRankings(gameState) {
  if (!gameState.teams) {
    return [];
  }

  return [...gameState.teams].sort((a, b) => b.position - a.position);
}

/**
 * Validate game state
 * @param {Object} gameState - Game state to validate
 * @returns {Object} Validation result { valid: boolean, errors: Array<string> }
 */
export function validateGameState(gameState) {
  const errors = [];

  if (!gameState.teams || !Array.isArray(gameState.teams)) {
    errors.push('Teams must be an array');
  } else {
    gameState.teams.forEach((team, idx) => {
      if (!team.name) {
        errors.push(`Team ${idx} missing name`);
      }
      if (!Array.isArray(team.players)) {
        errors.push(`Team ${idx} players must be an array`);
      }
      if (typeof team.position !== 'number' || team.position < 0 || team.position > 59) {
        errors.push(`Team ${idx} position must be between 0 and 59`);
      }
    });
  }

  if (typeof gameState.currentTurn !== 'number' || 
      gameState.currentTurn < 0 || 
      gameState.currentTurn >= (gameState.teams?.length || 0)) {
    errors.push('Invalid current turn');
  }

  if (!['waiting', 'playing', 'finished'].includes(gameState.gameStatus)) {
    errors.push('Invalid game status');
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
    teams: gameState.teams.map(team => ({
      ...team,
      position: 0
    })),
    currentTurn: 0,
    gameStatus: 'waiting',
    roundActive: false,
    currentRoundScore: 0,
    roundStartTime: null,
    roundStartPosition: null,
    usedCards: [],
    showRoundSummary: false,
    lastWordOnTimeUp: null,
    currentWordIsGolden: false,
    winnerTeam: null,
    drinkingPopup: null
  };
}

