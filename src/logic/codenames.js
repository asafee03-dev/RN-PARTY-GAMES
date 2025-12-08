/**
 * Codenames Game Logic
 * Pure functions for game flow, scoring, rounds, validation, and turn logic
 * No JSX, DOM, CSS, window, or document dependencies
 */

/**
 * Initialize a new game
 * @param {Object} redTeam - Red team object with { spymaster, guessers: [] }
 * @param {Object} blueTeam - Blue team object with { spymaster, guessers: [] }
 * @param {Array<string>} boardWords - Array of 25 words for the board
 * @param {Array<string>} keyMap - Array of 25 colors: 'red', 'blue', 'neutral', 'black'
 * @param {string} startingTeam - 'red' or 'blue'
 * @param {string} gameMode - 'friends' or 'rivals'
 * @returns {Object} Initial game state
 */
export function initializeGame(redTeam, blueTeam, boardWords, keyMap, startingTeam, gameMode = 'friends') {
  if (boardWords.length !== 25) {
    throw new Error('Board must have exactly 25 words');
  }

  if (keyMap.length !== 25) {
    throw new Error('Key map must have exactly 25 entries');
  }

  if (!['red', 'blue'].includes(startingTeam)) {
    throw new Error('Starting team must be red or blue');
  }

  const validColors = ['red', 'blue', 'neutral', 'black'];
  keyMap.forEach((color, idx) => {
    if (!validColors.includes(color)) {
      throw new Error(`Invalid color at index ${idx}: ${color}`);
    }
  });

  return {
    redTeam: {
      ...redTeam,
      revealedWords: []
    },
    blueTeam: {
      ...blueTeam,
      revealedWords: []
    },
    boardWords,
    keyMap,
    startingTeam,
    gameMode,
    gameStatus: 'playing', // 'setup' | 'playing' | 'finished'
    currentTurn: startingTeam,
    currentClue: null,
    guessesRemaining: 0,
    turnPhase: 'clue', // 'clue' | 'guess'
    turnStartTime: null,
    winnerTeam: null
  };
}

/**
 * Generate key map for a board
 * @param {string} startingTeam - 'red' or 'blue'
 * @returns {Array<string>} Array of 25 colors
 */
export function generateKeyMap(startingTeam) {
  if (!['red', 'blue'].includes(startingTeam)) {
    throw new Error('Starting team must be red or blue');
  }

  const keyMap = [];
  
  // Starting team gets 9 words
  for (let i = 0; i < 9; i++) {
    keyMap.push(startingTeam);
  }
  
  // Other team gets 8 words
  const otherTeam = startingTeam === 'red' ? 'blue' : 'red';
  for (let i = 0; i < 8; i++) {
    keyMap.push(otherTeam);
  }
  
  // 7 neutral words
  for (let i = 0; i < 7; i++) {
    keyMap.push('neutral');
  }
  
  // 1 black word
  keyMap.push('black');
  
  // Shuffle the array
  for (let i = keyMap.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keyMap[i], keyMap[j]] = [keyMap[j], keyMap[i]];
  }
  
  return keyMap;
}

/**
 * Get revealed indices
 * @param {Object} gameState - Current game state
 * @returns {Array<number>} Array of revealed word indices
 */
export function getRevealedIndices(gameState) {
  return [...gameState.redTeam.revealedWords, ...gameState.blueTeam.revealedWords];
}

/**
 * Count words left for a team
 * @param {Object} gameState - Current game state
 * @param {string} team - 'red' or 'blue'
 * @returns {number} Number of words remaining
 */
export function countWordsLeft(gameState, team) {
  if (!['red', 'blue'].includes(team)) {
    throw new Error('Team must be red or blue');
  }

  const teamColor = team;
  const allRevealedIndices = getRevealedIndices(gameState);
  
  let remainingCount = 0;
  gameState.keyMap.forEach((color, index) => {
    if (color === teamColor && !allRevealedIndices.includes(index)) {
      remainingCount++;
    }
  });
  
  return remainingCount;
}

/**
 * Check win condition for a team
 * @param {Object} gameState - Current game state
 * @param {string} team - 'red' or 'blue'
 * @returns {boolean} Whether team has won
 */
export function checkWinCondition(gameState, team) {
  const wordsLeft = countWordsLeft(gameState, team);
  return wordsLeft === 0;
}

/**
 * Submit a clue
 * @param {Object} gameState - Current game state
 * @param {number} number - Number of words the clue relates to
 * @returns {Object} Updated game state
 */
export function submitClue(gameState, number) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  if (typeof number !== 'number' || number < 1) {
    throw new Error('Clue number must be a positive number');
  }

  const updates = {
    currentClue: { number },
    guessesRemaining: number + 1,
    turnStartTime: Date.now()
  };

  if (gameState.gameMode === 'rivals') {
    updates.turnPhase = 'guess';
  }

  return {
    ...gameState,
    ...updates
  };
}

/**
 * Handle word click
 * @param {Object} gameState - Current game state
 * @param {number} index - Index of clicked word
 * @returns {Object} Updated game state
 */
export function handleWordClick(gameState, index) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  if (index < 0 || index >= gameState.boardWords.length) {
    throw new Error('Invalid word index');
  }

  // Check if word already revealed
  const alreadyRevealed = getRevealedIndices(gameState).includes(index);
  if (alreadyRevealed) {
    return gameState; // No change
  }

  const currentTeam = gameState.currentTurn;
  const wordColor = gameState.keyMap[index];

  const updatedRedRevealed = [...gameState.redTeam.revealedWords];
  const updatedBlueRevealed = [...gameState.blueTeam.revealedWords];

  // Add word to revealed list based on its actual color
  if (wordColor === 'red') {
    updatedRedRevealed.push(index);
  } else if (wordColor === 'blue') {
    updatedBlueRevealed.push(index);
  } else if (wordColor === 'neutral' || wordColor === 'black') {
    // Neutral and black words are revealed to both teams
    updatedRedRevealed.push(index);
    updatedBlueRevealed.push(index);
  }

  let gameStatus = gameState.gameStatus;
  let winnerTeam = gameState.winnerTeam;
  let switchTurn = false;
  let newGuessesRemaining = gameState.guessesRemaining - 1;

  // Handle black word
  if (wordColor === 'black') {
    gameStatus = 'finished';
    winnerTeam = currentTeam === 'red' ? 'blue' : 'red';
  }
  // Handle correct team word
  else if (wordColor === currentTeam) {
    const currentTeamRevealed = currentTeam === 'red' ? updatedRedRevealed : updatedBlueRevealed;
    
    // Count total team words
    let totalTeamWords = 0;
    gameState.keyMap.forEach((color) => {
      if (color === currentTeam) totalTeamWords++;
    });
    
    // Count revealed team words
    let revealedTeamWords = 0;
    currentTeamRevealed.forEach((revealedIndex) => {
      if (gameState.keyMap[revealedIndex] === currentTeam) {
        revealedTeamWords++;
      }
    });
    
    // Check win condition
    if (revealedTeamWords >= totalTeamWords) {
      gameStatus = 'finished';
      winnerTeam = currentTeam;
    }
  }
  // Handle wrong color
  else if (wordColor !== currentTeam) {
    switchTurn = true;
  }

  if (newGuessesRemaining <= 0 || switchTurn) {
    switchTurn = true;
  }

  // Check win condition after update
  const allRevealedAfterUpdate = [...updatedRedRevealed, ...updatedBlueRevealed];
  let redWordsLeft = 0;
  let blueWordsLeft = 0;
  
  gameState.keyMap.forEach((color, idx) => {
    if (color === 'red' && !allRevealedAfterUpdate.includes(idx)) {
      redWordsLeft++;
    }
    if (color === 'blue' && !allRevealedAfterUpdate.includes(idx)) {
      blueWordsLeft++;
    }
  });
  
  if (redWordsLeft === 0 && gameStatus !== 'finished') {
    gameStatus = 'finished';
    winnerTeam = 'red';
  } else if (blueWordsLeft === 0 && gameStatus !== 'finished') {
    gameStatus = 'finished';
    winnerTeam = 'blue';
  }

  const updates = {
    redTeam: { ...gameState.redTeam, revealedWords: updatedRedRevealed },
    blueTeam: { ...gameState.blueTeam, revealedWords: updatedBlueRevealed },
    gameStatus,
    guessesRemaining: switchTurn || gameStatus === 'finished' ? 0 : newGuessesRemaining
  };

  if (winnerTeam) {
    updates.winnerTeam = winnerTeam;
  }

  if (switchTurn && gameStatus !== 'finished') {
    updates.currentTurn = currentTeam === 'red' ? 'blue' : 'red';
    updates.currentClue = null;
    updates.guessesRemaining = 0;
    
    if (gameState.gameMode === 'rivals') {
      updates.turnPhase = 'clue';
      updates.turnStartTime = Date.now();
    }
  }

  return {
    ...gameState,
    ...updates
  };
}

/**
 * End turn
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export function endTurn(gameState) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  const currentTeam = gameState.currentTurn;
  if (currentTeam !== 'red' && currentTeam !== 'blue') {
    throw new Error('Invalid current team');
  }

  const nextTeam = currentTeam === 'red' ? 'blue' : 'red';

  const updates = {
    currentTurn: nextTeam,
    currentClue: null,
    guessesRemaining: 0
  };

  if (gameState.gameMode === 'rivals') {
    updates.turnPhase = 'clue';
    updates.turnStartTime = Date.now();
  }

  return {
    ...gameState,
    ...updates
  };
}

/**
 * Handle time up (for rivals mode)
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export function handleTimeUp(gameState) {
  if (gameState.gameMode !== 'rivals') {
    return gameState;
  }

  const nextTeam = gameState.currentTurn === 'red' ? 'blue' : 'red';

  const updates = {
    currentTurn: nextTeam,
    currentClue: null,
    guessesRemaining: 0,
    turnPhase: 'clue',
    turnStartTime: Date.now()
  };

  return {
    ...gameState,
    ...updates
  };
}

/**
 * Get player role
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {Object|null} Role object { team: 'red'|'blue', role: 'spymaster'|'guesser' } or null
 */
export function getPlayerRole(gameState, playerName) {
  if (!playerName) return null;

  if (gameState.redTeam.spymaster === playerName) {
    return { team: 'red', role: 'spymaster' };
  }
  if (gameState.blueTeam.spymaster === playerName) {
    return { team: 'blue', role: 'spymaster' };
  }
  if (gameState.redTeam.guessers.includes(playerName)) {
    return { team: 'red', role: 'guesser' };
  }
  if (gameState.blueTeam.guessers.includes(playerName)) {
    return { team: 'blue', role: 'guesser' };
  }

  return null;
}

/**
 * Check if it's a player's turn
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {boolean} Whether it's the player's turn
 */
export function isPlayerTurn(gameState, playerName) {
  const playerRole = getPlayerRole(gameState, playerName);
  if (!playerRole) return false;
  return playerRole.team === gameState.currentTurn;
}

/**
 * Validate game state
 * @param {Object} gameState - Game state to validate
 * @returns {Object} Validation result { valid: boolean, errors: Array<string> }
 */
export function validateGameState(gameState) {
  const errors = [];

  if (!gameState.redTeam || !gameState.blueTeam) {
    errors.push('Both teams must be defined');
  } else {
    if (!gameState.redTeam.spymaster) {
      errors.push('Red team missing spymaster');
    }
    if (!gameState.blueTeam.spymaster) {
      errors.push('Blue team missing spymaster');
    }
    if (!Array.isArray(gameState.redTeam.guessers)) {
      errors.push('Red team guessers must be an array');
    }
    if (!Array.isArray(gameState.blueTeam.guessers)) {
      errors.push('Blue team guessers must be an array');
    }
    if (!Array.isArray(gameState.redTeam.revealedWords)) {
      errors.push('Red team revealedWords must be an array');
    }
    if (!Array.isArray(gameState.blueTeam.revealedWords)) {
      errors.push('Blue team revealedWords must be an array');
    }
  }

  if (!gameState.boardWords || !Array.isArray(gameState.boardWords) || gameState.boardWords.length !== 25) {
    errors.push('Board must have exactly 25 words');
  }

  if (!gameState.keyMap || !Array.isArray(gameState.keyMap) || gameState.keyMap.length !== 25) {
    errors.push('Key map must have exactly 25 entries');
  }

  if (!['red', 'blue'].includes(gameState.currentTurn)) {
    errors.push('Current turn must be red or blue');
  }

  if (!['setup', 'playing', 'finished'].includes(gameState.gameStatus)) {
    errors.push('Invalid game status');
  }

  if (!['friends', 'rivals'].includes(gameState.gameMode)) {
    errors.push('Invalid game mode');
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
    redTeam: {
      ...gameState.redTeam,
      revealedWords: []
    },
    blueTeam: {
      ...gameState.blueTeam,
      revealedWords: []
    },
    gameStatus: 'setup',
    currentTurn: 'red',
    startingTeam: 'red',
    boardWords: [],
    keyMap: [],
    guessesRemaining: 0,
    turnPhase: 'clue',
    currentClue: null,
    winnerTeam: null,
    turnStartTime: null
  };
}

