// ===== SQUARE WARS — constants.js =====
export const ROWS = 20;
export const COLS = 30;

export const PLAYER = Object.freeze({ RED: 1, BLUE: 2 });

export const GAME_MODES = Object.freeze({ SINGLE: "single", MULTI: "multi" });

export const SCORING_MODES = Object.freeze({
  CLASSIC: "classic",
  AREA: "area",
  QUICKFIRE: "quickfire",
});

// Quick Fire defaults and bounds
export const QUICKFIRE_DEFAULT = 5;
export const QUICKFIRE_MIN = 1;
export const QUICKFIRE_MAX = 10;

export const DIFFICULTIES = Object.freeze({
  BEGINNER: "beginner",
  MEDIUM: "medium",
  ADVANCED: "advanced",
  IMPOSSIBLE: "impossible",
});

export const UI_IDS = Object.freeze({
  modeSelectModal: "modeSelectModal",
  scoringSelectModal: "scoringSelectModal",
  quickfireSelectModal: "quickfireSelectModal", // NEW modal
  instructionsModal: "instructionsModal",
  difficultySelectModal: "difficultySelectModal",
  endGameModal: "endGameModal",
  endGameTitle: "endGameTitle",
  endGameSubtitle: "endGameSubtitle",

  gameTitle: "gameTitle",
  redLabel: "redLabel",
  blueLabel: "blueLabel",
  redGames: "redGames",
  blueGames: "blueGames",
  redScore: "redScore",
  blueScore: "blueScore",
  currentPlayer: "currentPlayer",
  currentPlayerBanner: "currentPlayerBanner",

  gameGrid: "gameGrid",
  outlineLayer: "outlineLayer",

  tryAgainBtn: "tryAgainBtn",
  changeModeBtn: "changeModeBtn",
});

export const CSS = Object.freeze({
  HIDDEN: "hidden",
  PLAYER1: "player1",
  PLAYER2: "player2",
  COMPUTER_TURN: "computer-turn",
  LAST_MOVE: "last-move",
  LEADING: "leading",
  PLAYER1_TURN: "player1-turn",
  PLAYER2_TURN: "player2-turn",
});

export const CELL = 20;
export const GAP = 2;
export const GRID_PADDING = 8;
export const BORDER_WIDTH = 1;

export const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]);

export const KEY = Object.freeze({ ESCAPE: "Escape" });

export const AI = Object.freeze({
  COMPUTER_THINK_DELAY: 500,
  BEGINNER_BLOCK_PROB: 0.6,
  MEDIUM_DEPTH: 3,
  MEDIUM_TWO_BLOCK_PROB: 0.9,
  ADVANCED_DEPTH: 4,
  ADVANCED_TWO_BLOCK_PROB: 0.95,
  ADVANCED_PICK_SPLITS: Object.freeze({ BEST: 0.85, SECOND: 0.97 }),
  IMPOSSIBLE_DEPTH: 6,
});
