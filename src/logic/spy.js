/**
 * Spy Game Logic
 * Pure functions for game flow, scoring, rounds, validation, and turn logic
 * No JSX, DOM, CSS, window, or document dependencies
 */

/**
 * Initialize a new game
 * @param {Array} players - Array of player objects with { name }
 * @returns {Object} Initial game state
 */
export function initializeGame(players) {
  if (!players || players.length < 3) {
    throw new Error('Need at least 3 players');
  }

  return {
    players: players.map(p => ({ name: p.name })),
    gameStatus: 'lobby', // 'lobby' | 'playing' | 'finished'
    gameStartTime: null,
    spyName: null,
    chosenLocation: null,
    allLocations: null,
    eliminatedLocations: [],
    allVotesSubmitted: false
  };
}

/**
 * Start a new game
 * @param {Object} gameState - Current game state
 * @param {Object} location - Location object with { location: string, roles: Array<string> }
 * @param {Array<Object>} allLocations - Array of all available locations
 * @returns {Object} Updated game state
 */
export function startGame(gameState, location, allLocations) {
  if (gameState.gameStatus !== 'lobby') {
    throw new Error('Game must be in lobby status');
  }

  if (!location || !location.location || !Array.isArray(location.roles)) {
    throw new Error('Invalid location');
  }

  if (!allLocations || !Array.isArray(allLocations)) {
    throw new Error('Invalid all locations array');
  }

  // Choose random spy
  const freshPlayers = gameState.players.map(p => ({ name: p.name }));
  const randomSpyIndex = Math.floor(Math.random() * freshPlayers.length);
  const spyName = freshPlayers[randomSpyIndex].name;

  // Assign roles
  const updatedPlayers = freshPlayers.map((player, index) => {
    if (index === randomSpyIndex) {
      return {
        name: player.name,
        isSpy: true,
        location: '',
        role: '',
        vote: null
      };
    } else {
      // Assign random role from location (allows duplicates)
      const randomRole = location.roles[Math.floor(Math.random() * location.roles.length)];
      return {
        name: player.name,
        isSpy: false,
        location: location.location,
        role: randomRole,
        vote: null
      };
    }
  });

  // Create list of all location names
  const allLocationNames = allLocations.map(loc => loc.location).filter(loc => loc != null);

  return {
    ...gameState,
    players: updatedPlayers,
    gameStatus: 'playing',
    gameStartTime: Date.now(),
    spyName: spyName || '',
    chosenLocation: location.location || '',
    allLocations: allLocationNames,
    eliminatedLocations: [],
    allVotesSubmitted: false
  };
}

/**
 * Toggle location eliminated status (spy only)
 * @param {Object} gameState - Current game state
 * @param {string} locationName - Location name to toggle
 * @param {string} playerName - Player name (must be spy)
 * @returns {Object} Updated game state
 */
export function toggleLocationEliminated(gameState, locationName, playerName) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  const player = gameState.players.find(p => p.name === playerName);
  if (!player || !player.isSpy) {
    throw new Error('Only the spy can eliminate locations');
  }

  const eliminated = gameState.eliminatedLocations || [];
  let updatedEliminated;

  if (eliminated.includes(locationName)) {
    updatedEliminated = eliminated.filter(loc => loc !== locationName);
  } else {
    updatedEliminated = [...eliminated, locationName];
  }

  return {
    ...gameState,
    eliminatedLocations: updatedEliminated
  };
}

/**
 * Vote for a player
 * @param {Object} gameState - Current game state
 * @param {string} voterName - Name of player voting
 * @param {string} votedPlayerName - Name of player being voted for
 * @returns {Object} Updated game state
 */
export function voteForPlayer(gameState, voterName, votedPlayerName) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  if (voterName === votedPlayerName) {
    throw new Error('Cannot vote for yourself');
  }

  const updatedPlayers = gameState.players.map(p => {
    if (p.name === voterName) {
      return { ...p, vote: votedPlayerName };
    }
    return p;
  });

  // Check if all players have voted
  const allVoted = updatedPlayers.every(p => p.vote !== null && p.vote !== undefined);

  return {
    ...gameState,
    players: updatedPlayers,
    allVotesSubmitted: allVoted && updatedPlayers.length > 0
  };
}

/**
 * End game
 * @param {Object} gameState - Current game state
 * @returns {Object} Updated game state
 */
export function endGame(gameState) {
  if (gameState.gameStatus !== 'playing') {
    throw new Error('Game must be in playing status');
  }

  return {
    ...gameState,
    gameStatus: 'finished'
  };
}

/**
 * Check if player is spy
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {boolean} Whether player is spy
 */
export function isSpy(gameState, playerName) {
  const player = gameState.players.find(p => p.name === playerName);
  return player ? (player.isSpy === true) : false;
}

/**
 * Get player info
 * @param {Object} gameState - Current game state
 * @param {string} playerName - Player name
 * @returns {Object|null} Player object or null
 */
export function getPlayerInfo(gameState, playerName) {
  return gameState.players.find(p => p.name === playerName) || null;
}

/**
 * Calculate voting results
 * @param {Object} gameState - Current game state
 * @returns {Object} Voting results
 */
export function calculateVotingResults(gameState) {
  if (gameState.gameStatus !== 'finished') {
    throw new Error('Game must be finished to calculate results');
  }

  const voteCounts = gameState.players.map(player => {
    const votes = gameState.players.filter(p => p.vote === player.name).length;
    const wasSpy = player.name === gameState.spyName;
    return { player, votes, wasSpy };
  });

  // Find max votes
  const maxVotes = Math.max(...voteCounts.map(v => v.votes));
  const spyVotes = voteCounts.find(v => v.wasSpy)?.votes || 0;
  
  // Spy was caught only if spy got the MOST votes (tied or highest)
  const spyCaught = spyVotes === maxVotes && spyVotes > 0;
  const spyWon = !spyCaught;

  return {
    voteCounts: voteCounts.sort((a, b) => b.votes - a.votes),
    spyCaught,
    spyWon,
    spyName: gameState.spyName,
    chosenLocation: gameState.chosenLocation
  };
}

/**
 * Check if timer expired
 * @param {Object} gameState - Current game state
 * @param {number} duration - Game duration in seconds (default: 360 = 6 minutes)
 * @returns {boolean} Whether timer expired
 */
export function isTimerExpired(gameState, duration = 360) {
  if (!gameState.gameStartTime) {
    return false;
  }

  const elapsed = Math.floor((Date.now() - gameState.gameStartTime) / 1000);
  return elapsed >= duration;
}

/**
 * Get time remaining
 * @param {Object} gameState - Current game state
 * @param {number} duration - Game duration in seconds (default: 360 = 6 minutes)
 * @returns {number} Time remaining in seconds
 */
export function getTimeRemaining(gameState, duration = 360) {
  if (!gameState.gameStartTime) {
    return duration;
  }

  const elapsed = Math.floor((Date.now() - gameState.gameStartTime) / 1000);
  return Math.max(0, duration - elapsed);
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
    if (gameState.players.length < 3) {
      errors.push('Need at least 3 players');
    }
    gameState.players.forEach((player, idx) => {
      if (!player.name) {
        errors.push(`Player ${idx} missing name`);
      }
    });
  }

  if (!['lobby', 'playing', 'finished'].includes(gameState.gameStatus)) {
    errors.push('Invalid game status');
  }

  if (gameState.gameStatus === 'playing') {
    if (!gameState.spyName) {
      errors.push('Missing spy name');
    }
    if (!gameState.chosenLocation) {
      errors.push('Missing chosen location');
    }
    if (!gameState.allLocations || !Array.isArray(gameState.allLocations)) {
      errors.push('Missing or invalid all locations');
    }
    if (!Array.isArray(gameState.eliminatedLocations)) {
      errors.push('Eliminated locations must be an array');
    }

    // Check that exactly one player is spy
    const spyCount = gameState.players.filter(p => p.isSpy === true).length;
    if (spyCount !== 1) {
      errors.push(`Expected exactly 1 spy, found ${spyCount}`);
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
    players: gameState.players.map(p => ({ name: p.name })),
    gameStatus: 'lobby',
    gameStartTime: null,
    spyName: null,
    chosenLocation: null,
    allLocations: null,
    eliminatedLocations: null,
    allVotesSubmitted: false
  };
}

