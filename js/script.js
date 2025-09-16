// ===== SQUARE WARS — script.js =====
import {
  ROWS,
  COLS,
  PLAYER,
  GAME_MODES,
  SCORING_MODES,
  DIFFICULTIES,
  UI_IDS,
  CSS,
  DIRECTIONS,
  KEY,
  AI,
} from "./constants.js?v=11";

import {
  updateDisplay,
  buildGrid,
  updateCellDisplay,
  updateAllCellDisplays,
  drawOutlineRect,
  drawWinStrike,
  showEndGameModal,
  hideEndGameModal,
  showInstructions as showInstructionsUI,
  closeInstructionsUI,
  updateLabelsForModeUI,
} from "./ui.js?v=11";

import { chooseComputerMove } from "./ai.js?v=11";

let grid = [];
let currentPlayer = PLAYER.RED;
let blockedCells = new Set();
let redGames = 0;
let blueGames = 0;
let gameActive = true;
let lastMovePosition = null;
let gameMode = null;
let scoringMode = SCORING_MODES.CLASSIC;
let aiDifficulty = null;

// live ownership map for AREA mode
let ownership = Object.create(null);

/* ------------ Mode, scoring & difficulty ------------ */
function setGameMode(mode) {
  gameMode = mode;
  const modeModal = document.getElementById(UI_IDS.modeSelectModal);
  modeModal.classList.add(CSS.HIDDEN);

  const scoringModal = document.getElementById(UI_IDS.scoringSelectModal);
  scoringModal.classList.remove(CSS.HIDDEN);
  scoringModal.setAttribute("aria-hidden", "false");
}

function setScoringMode(mode) {
  scoringMode = mode;
  const scoringModal = document.getElementById(UI_IDS.scoringSelectModal);
  scoringModal.classList.add(CSS.HIDDEN);
  scoringModal.setAttribute("aria-hidden", "true");

  ownership = Object.create(null);

  if (gameMode === GAME_MODES.SINGLE) {
    const difficultyModal = document.getElementById(
      UI_IDS.difficultySelectModal
    );
    difficultyModal.classList.remove(CSS.HIDDEN);
    difficultyModal.setAttribute("aria-hidden", "false");
  } else {
    updateLabelsForModeUI(gameMode, aiDifficulty, scoringMode);
    showInstructionsUI(scoringMode);
  }
}

function setDifficulty(difficulty) {
  aiDifficulty = difficulty;
  const m = document.getElementById(UI_IDS.difficultySelectModal);
  m.classList.add(CSS.HIDDEN);
  m.setAttribute("aria-hidden", "true");
  updateLabelsForModeUI(gameMode, aiDifficulty, scoringMode);
  showInstructionsUI(scoringMode);
}

function showInstructions() {
  showInstructionsUI(scoringMode);
}
function closeInstructions() {
  closeInstructionsUI(initGame);
}

/* ------------ Game init & grid ------------ */
function initGame() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  currentPlayer = PLAYER.RED;
  blockedCells = new Set();
  redGames = blueGames = 0;
  gameActive = true;
  lastMovePosition = null;
  ownership = Object.create(null);

  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (outlineLayer) outlineLayer.innerHTML = "";

  buildGrid(ROWS, COLS, (col) => {
    if (!gameActive) return;
    if (gameMode === GAME_MODES.SINGLE && currentPlayer !== PLAYER.RED) return;
    dropPiece(col);
  });

  updateDisplay(
    currentPlayer,
    gameMode,
    aiDifficulty,
    scoringMode,
    redGames,
    blueGames
  );
}

function dropPiece(col) {
  if (!gameActive) return;

  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row][col] === 0 && !blockedCells.has(`${row}-${col}`)) {
      grid[row][col] = currentPlayer;
      lastMovePosition = { row, col };
      updateCellDisplay(grid, blockedCells, lastMovePosition, row, col);

      const didWin = checkForWin(row, col);
      if (didWin) {
        if (scoringMode === SCORING_MODES.CLASSIC) {
          if (currentPlayer === PLAYER.RED) redGames++;
          else blueGames++;
        }
        currentPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
      } else {
        currentPlayer = currentPlayer === PLAYER.RED ? PLAYER.BLUE : PLAYER.RED;
      }

      updateDisplay(
        currentPlayer,
        gameMode,
        aiDifficulty,
        scoringMode,
        redGames,
        blueGames
      );
      checkEndOfGame();

      if (
        gameMode === GAME_MODES.SINGLE &&
        currentPlayer === PLAYER.BLUE &&
        gameActive
      ) {
        setTimeout(makeComputerMove, AI.COMPUTER_THINK_DELAY);
      }
      return;
    }
  }
}

function makeComputerMove() {
  if (
    !gameActive ||
    currentPlayer !== PLAYER.BLUE ||
    gameMode !== GAME_MODES.SINGLE
  )
    return;
  const col = chooseComputerMove({ grid, blockedCells, aiDifficulty });
  if (col !== -1) dropPiece(col);
}

/* ------------ Rules & helpers ------------ */
function hasAnyValidMove() {
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][c] === 0 && !blockedCells.has(`${r}-${c}`)) return true;
    }
  }
  return false;
}

function getWinnerLabel() {
  if (redGames > blueGames)
    return gameMode === GAME_MODES.SINGLE ? "You (Red)" : "Player 1 (Red)";
  if (blueGames > redGames) {
    if (gameMode === GAME_MODES.SINGLE) {
      const diff = aiDifficulty
        ? ` - ${aiDifficulty[0].toUpperCase() + aiDifficulty.slice(1)}`
        : "";
      return `Computer (Blue)${diff}`;
    }
    return "Player 2 (Blue)";
  }
  return "Tie";
}

function showEnd() {
  showEndGameModal(getWinnerLabel(), redGames, blueGames);
  gameActive = false;
}
function checkEndOfGame() {
  if (!hasAnyValidMove()) showEnd();
}

function checkForWin(row, col) {
  const player = grid[row][col];
  for (let [dr, dc] of DIRECTIONS) {
    const line = getLine(row, col, dr, dc, player);
    if (line.length >= 4) {
      boxOffConnectedArea(line, player); // will also draw the strike + outline
      return true;
    }
  }
  return false;
}

function getLine(sr, sc, dr, dc, player) {
  const line = [{ row: sr, col: sc }];
  let r = sr + dr,
    c = sc + dc;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    grid[r][c] === player &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    line.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  r = sr - dr;
  c = sc - dc;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    grid[r][c] === player &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    line.unshift({ row: r, col: c });
    r -= dr;
    c -= dc;
  }
  return line;
}

/** Close area, mark blocked, update scores (AREA), and draw strike + outline */
function boxOffConnectedArea(winningLine, player) {
  const connected = new Set(),
    queue = [...winningLine];
  winningLine.forEach(({ row, col }) => {
    if (!blockedCells.has(`${row}-${col}`)) connected.add(`${row}-${col}`);
  });

  while (queue.length) {
    const { row, col } = queue.shift();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr,
          nc = col + dc,
          key = `${nr}-${nc}`;
        if (
          nr >= 0 &&
          nr < ROWS &&
          nc >= 0 &&
          nc < COLS &&
          !connected.has(key) &&
          !blockedCells.has(key)
        ) {
          if (grid[nr][nc] !== 0) {
            connected.add(key);
            queue.push({ row: nr, col: nc });
          }
        }
      }
    }
  }
  if (!connected.size) return;

  const coords = [...connected].map((k) => {
    const [r, c] = k.split("-").map(Number);
    return { row: r, col: c };
  });
  const minRow = Math.min(...coords.map((s) => s.row));
  const maxRow = Math.max(...coords.map((s) => s.row));
  const minCol = Math.min(...coords.map((s) => s.col));
  const maxCol = Math.max(...coords.map((s) => s.col));

  // Fill rectangle & scoring
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const key = `${r}-${c}`;
      blockedCells.add(key);
      if (scoringMode === SCORING_MODES.AREA) {
        const prev = ownership[key] | 0;
        if (prev !== player) {
          if (prev === PLAYER.RED) redGames--;
          else if (prev === PLAYER.BLUE) blueGames--;
          if (player === PLAYER.RED) redGames++;
          else blueGames++;
          ownership[key] = player;
        }
      }
    }
  }

  updateAllCellDisplays(grid, blockedCells, lastMovePosition, ROWS, COLS);

  // NEW: draw persistent win strike through the contiguous line
  drawWinStrike(winningLine, player);

  // Then draw the outlined hatched box
  drawOutlineRect(minRow, maxRow, minCol, maxCol, player);
}

/* ------------ Keyboard & modal wiring ------------ */
document.addEventListener("keydown", (e) => {
  if (e.key === KEY.ESCAPE) {
    const i = document.getElementById(UI_IDS.instructionsModal);
    const d = document.getElementById(UI_IDS.difficultySelectModal);
    const s = document.getElementById(UI_IDS.scoringSelectModal);
    if (i && !i.classList.contains(CSS.HIDDEN)) closeInstructions();
    if (d && !d.classList.contains(CSS.HIDDEN)) {
      d.classList.add(CSS.HIDDEN);
      d.setAttribute("aria-hidden", "true");
    }
    if (s && !s.classList.contains(CSS.HIDDEN)) {
      s.classList.add(CSS.HIDDEN);
      s.setAttribute("aria-hidden", "true");
    }
  }
});
document
  .getElementById(UI_IDS.instructionsModal)
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeInstructions();
  });
document
  .getElementById(UI_IDS.difficultySelectModal)
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add(CSS.HIDDEN);
      e.currentTarget.setAttribute("aria-hidden", "True");
    }
  });
document
  .getElementById(UI_IDS.scoringSelectModal)
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add(CSS.HIDDEN);
      e.currentTarget.setAttribute("aria-hidden", "True");
    }
  });
document.getElementById(UI_IDS.endGameModal).addEventListener("click", () => {
  /* keep open on backdrop click */
});

document.getElementById(UI_IDS.tryAgainBtn).addEventListener("click", () => {
  hideEndGameModal();
  redGames = 0;
  blueGames = 0;
  initGame();
  updateDisplay(
    currentPlayer,
    gameMode,
    aiDifficulty,
    scoringMode,
    redGames,
    blueGames
  );
});

document.getElementById(UI_IDS.changeModeBtn).addEventListener("click", () => {
  hideEndGameModal();
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (outlineLayer) outlineLayer.innerHTML = "";
  redGames = 0;
  blueGames = 0;
  gameActive = false;
  gameMode = null;
  aiDifficulty = null;
  scoringMode = SCORING_MODES.CLASSIC;
  ownership = Object.create(null);
  updateLabelsForModeUI(gameMode, aiDifficulty, scoringMode);
  const modeModal = document.getElementById(UI_IDS.modeSelectModal);
  modeModal.classList.remove(CSS.HIDDEN);
  modeModal.setAttribute("aria-hidden", "false");
  updateDisplay(
    currentPlayer,
    gameMode,
    aiDifficulty,
    scoringMode,
    redGames,
    blueGames
  );
});

/* ------------ Expose for inline HTML ------------ */
window.setGameMode = setGameMode;
window.setScoringMode = setScoringMode;
window.setDifficulty = setDifficulty;
window.startNewGame = () => initGame();
window.closeInstructions = closeInstructions;
