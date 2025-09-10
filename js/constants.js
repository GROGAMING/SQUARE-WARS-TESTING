// ===== SQUARE WARS — constants.js =====

// Board size
export const ROWS = 20;
export const COLS = 30;

// Players
export const PLAYER = Object.freeze({
  RED: 1,
  BLUE: 2,
});

// Game modes
export const GAME_MODES = Object.freeze({
  SINGLE: "single",
  MULTI: "multi",
});

// AI difficulty labels
export const DIFFICULTIES = Object.freeze({
  BEGINNER: "beginner",
  MEDIUM: "medium",
  ADVANCED: "advanced",
});

// UI element IDs (so we never hard-code strings in logic)
export const UI_IDS = Object.freeze({
  modeSelectModal: "modeSelectModal",
  difficultySelectModal: "difficultySelectModal",
  instructionsModal: "instructionsModal",
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

// CSS class names we toggle
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

// Grid drawing metrics
export const CELL = 20;
export const GAP = 2;
export const GRID_PADDING = 8;
export const BORDER_WIDTH = 1;

// Common directions used all over the game
export const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]);

// Keyboard keys we care about
export const KEY = Object.freeze({
  ESCAPE: "Escape",
});

// AI configuration knobs (tweakable)
export const AI = Object.freeze({
  COMPUTER_THINK_DELAY: 500,

  BEGINNER_BLOCK_PROB: 0.6,

  MEDIUM_DEPTH: 3,
  MEDIUM_TWO_BLOCK_PROB: 0.9,

  ADVANCED_DEPTH: 4,
  ADVANCED_TWO_BLOCK_PROB: 0.95,
  ADVANCED_PICK_SPLITS: Object.freeze({
    BEST: 0.85, // top move 85%
    SECOND: 0.97, // second best up to 97%
    // remaining 3% uses third best
  }),
});
