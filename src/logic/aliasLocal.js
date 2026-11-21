/**
 * Alias - single phone mode.
 *
 * Pure functions over a "room-shaped" state object (same snake_case fields the
 * online room has), so the existing Alias components (GameBoard, RoundSummary,
 * TimeUpPopup, GoldenRoundCard) work unchanged. No React, no Firestore: there
 * is only one phone, so none of the multi-device guards are needed here.
 * The rules mirror AliasGameScreen's transactions.
 */

export const MAX_POSITION = 59;
export const ROUND_SECONDS = 60;
export const TEAM_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const moveTeam = (teams, teamIndex, delta) =>
  teams.map((t, i) => (i === teamIndex ? { ...t, position: Math.max(0, Math.min(MAX_POSITION, (t.position || 0) + delta)) } : t));

const randomGoldenSquares = () => {
  const squares = [];
  for (let i = 1; i < 59; i++) squares.push(i);
  return squares.sort(() => Math.random() - 0.5).slice(0, 10);
};

/**
 * @param {Array<{name: string, color: string, players: string[]}>} teams
 * @param {{goldenRounds?: boolean, drinking?: boolean}} options
 */
export function createLocalGame(teams, { goldenRounds = false, drinking = false } = {}) {
  return {
    teams: teams.map((t) => ({ ...t, position: 0, round_start_position: null, turns_played: 0 })),
    game_status: 'setup',
    current_turn: 0,
    round_active: false,
    current_round_score: 0,
    round_start_time: null,
    round_start_position: null,
    used_cards: [],
    show_round_summary: false,
    last_word_on_time_up: null,
    current_word_is_golden: false,
    winner_team: null,
    golden_rounds_enabled: !!goldenRounds,
    golden_squares: goldenRounds ? randomGoldenSquares() : [],
    drinking_mode: !!drinking,
    drinking_popup: null,
  };
}

/** Who explains on the team's next turn: members take turns in order. */
export function getExplainer(state) {
  const team = state.teams[state.current_turn];
  const players = (team?.players || []).filter(Boolean);
  if (players.length === 0) return '';
  return players[(team.turns_played || 0) % players.length];
}

export function startRound(state, now = Date.now()) {
  if (state.round_active || state.show_round_summary || state.game_status === 'finished') return state;
  const turn = state.current_turn;
  const startPosition = state.teams[turn].position || 0;
  return {
    ...state,
    round_active: true,
    game_status: 'playing',
    current_round_score: 0,
    round_start_time: now,
    round_start_position: startPosition,
    teams: state.teams.map((t, i) => (i === turn ? { ...t, round_start_position: startPosition } : t)),
    used_cards: [],
    show_round_summary: false,
    last_word_on_time_up: null,
    current_word_is_golden: false,
  };
}

/** Timer hit zero: remember the word on screen, the team then decides about it. */
export function freezeLastWord(state, word) {
  if (!state.round_active || state.last_word_on_time_up || !word) return state;
  return { ...state, last_word_on_time_up: word };
}

/**
 * Correct answer. teamIndex = the team that guessed (golden words and the last
 * word can go to any team); defaults to the playing team.
 */
export function markCorrect(state, word, teamIndex = null, timeUp = false) {
  if (!state.round_active) return state;
  const turn = state.current_turn;
  const scoring = teamIndex !== null ? teamIndex : turn;
  if (!state.teams[scoring]) return state;

  const index = state.used_cards.length;
  const isGolden = state.current_word_is_golden && !timeUp;
  const card = {
    words: word,
    status: 'correct',
    cardNumber: index + 1,
    isLastWord: !!timeUp,
    isGoldenWord: isGolden,
    ...(isGolden || timeUp ? { teamThatGuessed: scoring } : {}),
  };
  const teams = moveTeam(state.teams, scoring, 1);
  const usedCards = [...state.used_cards, card];
  const next = {
    ...state,
    teams,
    used_cards: usedCards,
    current_round_score: usedCards.filter((c) => c.status === 'correct').length,
  };

  if (teams[scoring].position >= MAX_POSITION) {
    next.game_status = 'finished';
    next.winner_team = teams[scoring].name;
  }
  if (timeUp) {
    next.show_round_summary = true;
    next.round_active = false;
  } else {
    next.current_word_is_golden = !!(state.golden_rounds_enabled && state.golden_squares.includes(teams[scoring].position));
  }
  return next;
}

/** Skip: golden words cannot be skipped. */
export function markSkip(state, word, timeUp = false) {
  if (!state.round_active || state.current_word_is_golden) return state;
  const turn = state.current_turn;
  const usedCards = [
    ...state.used_cards,
    { words: word, status: 'skipped', cardNumber: state.used_cards.length + 1, isLastWord: !!timeUp, ...(timeUp ? { teamThatGuessed: null } : {}) },
  ];
  const next = { ...state, teams: moveTeam(state.teams, turn, -1), used_cards: usedCards };
  if (timeUp) {
    next.show_round_summary = true;
    next.round_active = false;
  } else {
    next.current_round_score = usedCards.filter((c) => c.status === 'correct').length;
  }
  return next;
}

/** Round summary: flip a normal word between correct and skipped. */
export function toggleCardStatus(state, cardIndex) {
  if (!state.show_round_summary) return state;
  const card = state.used_cards[cardIndex];
  if (!card || card.isLastWord || card.isGoldenWord) return state;
  const wasCorrect = card.status === 'correct';
  const usedCards = state.used_cards.map((c, i) => (i === cardIndex ? { ...c, status: wasCorrect ? 'skipped' : 'correct' } : c));
  return {
    ...state,
    used_cards: usedCards,
    teams: moveTeam(state.teams, state.current_turn, wasCorrect ? -1 : 1),
    current_round_score: usedCards.filter((c) => c.status === 'correct' && (!c.isLastWord || c.teamThatGuessed === state.current_turn)).length,
  };
}

/** Round summary: give the last / golden word to a team (null = nobody). */
export function reassignCardTeam(state, cardIndex, newTeamIndex) {
  if (!state.show_round_summary) return state;
  const card = state.used_cards[cardIndex];
  if (!card) return state;
  const previous = card.teamThatGuessed ?? null;
  if (previous === newTeamIndex) return state;

  let teams = state.teams;
  if (previous !== null) teams = moveTeam(teams, previous, -1);
  if (newTeamIndex !== null) teams = moveTeam(teams, newTeamIndex, 1);
  const usedCards = state.used_cards.map((c, i) =>
    i === cardIndex ? { ...c, status: newTeamIndex !== null ? 'correct' : 'skipped', teamThatGuessed: newTeamIndex } : c
  );
  const next = {
    ...state,
    teams,
    used_cards: usedCards,
    current_round_score: usedCards.filter((c) => c.status === 'correct').length,
  };
  // A reassigned last word can also put a team on the final square
  const winner = teams.find((t) => t.position >= MAX_POSITION);
  if (winner) {
    next.game_status = 'finished';
    next.winner_team = winner.name;
  }
  return next;
}

/** Drinking mode: after a full round the team that advanced least drinks. */
function drinkingTeamName(teams) {
  const progress = teams.map((t, i) => ({ i, name: t.name, moved: (t.position || 0) - (t.round_start_position ?? t.position ?? 0) }));
  const min = Math.min(...progress.map((p) => p.moved));
  return progress.find((p) => p.moved === min)?.name || null;
}

/** Close the summary and hand the turn to the next team. */
export function finishRound(state) {
  if (!state.show_round_summary) return state;
  const turn = state.current_turn;
  // The next explainer of this team is the next member in the list
  let teams = state.teams.map((t, i) => (i === turn ? { ...t, turns_played: (t.turns_played || 0) + 1 } : t));
  const nextTurn = (turn + 1) % teams.length;
  const next = {
    ...state,
    current_turn: nextTurn,
    round_active: false,
    show_round_summary: false,
    current_round_score: 0,
    used_cards: [],
    last_word_on_time_up: null,
    current_word_is_golden: false,
    round_start_position: null,
  };
  if (nextTurn === 0) {
    if (state.drinking_mode) {
      const name = drinkingTeamName(state.teams);
      if (name) next.drinking_popup = { team_name: name };
    }
    teams = teams.map((t) => ({ ...t, round_start_position: null }));
  }
  next.teams = teams;
  return next;
}
