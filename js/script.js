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

let ownership = Object.create(null); // used by AREA scoring
let moveToken = 0; // prevents stale last-move outlines

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
  redGames = 0;
  blueGames = 0;
  gameActive = true;
  lastMovePosition = null;
  ownership = Object.create(null);
  moveToken = 0;

  // Clear overlays (SVG + lines)
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (outlineLayer) outlineLayer.innerHTML = "";

  buildGrid(ROWS, COLS, (col) => {
    if (!gameActive) return;
    if (gameMode === GAME_MODES.SINGLE && currentPlayer !== PLAYER.RED) return;
    dropPiece(col);
  });

  ensureControlsUI(); // make sure Reset/Change Mode is visible
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

      // token so only THIS move can set the highlight
      const token = ++moveToken;
      updateCellDisplay(grid, blockedCells, lastMovePosition, row, col, token);

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

/* ------------ Rules & helpers (non-AI) ------------ */
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
        ? ` - ${aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1)}`
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
      boxOffConnectedArea(line, player);
      return true;
    }
  }
  return false;
}

function getLine(startRow, startCol, dRow, dCol, player) {
  const line = [{ row: startRow, col: startCol }];

  let r = startRow + dRow,
    c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    grid[r][c] === player &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    line.push({ row: r, col: c });
    r += dRow;
    c += dCol;
  }

  r = startRow - dRow;
  c = startCol - dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    grid[r][c] === player &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    line.unshift({ row: r, col: c });
    r -= dRow;
    c -= dCol;
  }

  return line;
}

function boxOffConnectedArea(winningLine, player) {
  const connectedSquares = new Set();
  const queue = [...winningLine];

  winningLine.forEach(({ row, col }) => {
    if (!blockedCells.has(`${row}-${col}`))
      connectedSquares.add(`${row}-${col}`);
  });

  while (queue.length > 0) {
    const { row, col } = queue.shift();

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const newRow = row + dr,
          newCol = col + dc,
          key = `${newRow}-${newCol}`;
        if (
          newRow >= 0 &&
          newRow < ROWS &&
          newCol >= 0 &&
          newCol < COLS &&
          !connectedSquares.has(key) &&
          !blockedCells.has(key)
        ) {
          if (grid[newRow][newCol] !== 0) {
            connectedSquares.add(key);
            queue.push({ row: newRow, col: newCol });
          }
        }
      }
    }
  }

  if (connectedSquares.size === 0) return;

  const squares = Array.from(connectedSquares).map((key) => {
    const [r, c] = key.split("-").map(Number);
    return { row: r, col: c };
  });

  const minRow = Math.min(...squares.map((s) => s.row));
  const maxRow = Math.max(...squares.map((s) => s.row));
  const minCol = Math.min(...squares.map((s) => s.col));
  const maxCol = Math.max(...squares.map((s) => s.col));

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const key = `${r}-${c}`;
      blockedCells.add(key);

      // AREA scoring: per-square ownership (steal / recalc)
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
  drawWinStrike(winningLine, player);
  drawOutlineRect(minRow, maxRow, minCol, maxCol, player);
}

/* ------------ Controls: Reset + Change Mode (keeps difficulty) ------------ */
function ensureControlsUI() {
  const controls = document.querySelector(".controls");
  if (!controls) return;

  const mainBtn = controls.querySelector("button");
  if (mainBtn) {
    mainBtn.textContent = "🔄 Reset";
    mainBtn.onclick = () => initGame(); // keeps gameMode/scoring/difficulty
    mainBtn.setAttribute("title", "Reset the board (keeps mode & difficulty)");
  }

  // Create or reuse an inline Change Mode button
  let changeBtn = document.getElementById("changeModeInlineBtn");
  if (!changeBtn) {
    changeBtn = document.createElement("button");
    changeBtn.id = "changeModeInlineBtn";
    changeBtn.textContent = "🛠️ Change Mode";
    changeBtn.style.marginLeft = "10px";
    controls.appendChild(changeBtn);
  }
  changeBtn.onclick = () => {
    // open mode picker; reset scores and show modal flow
    const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
    if (outlineLayer) outlineLayer.innerHTML = "";
    redGames = 0;
    blueGames = 0;
    gameActive = false;
    aiDifficulty = null; // let user pick again when Single
    updateLabelsForModeUI(null, null, scoringMode);

    const modeModal = document.getElementById(UI_IDS.modeSelectModal);
    modeModal.classList.remove(CSS.HIDDEN);
    modeModal.setAttribute("aria-hidden", "false");
  };
}

/* ------------ Keyboard & modals ------------ */
document.addEventListener("keydown", (e) => {
  if (e.key === KEY.ESCAPE) {
    const instructionsModal = document.getElementById(UI_IDS.instructionsModal);
    const difficultyModal = document.getElementById(
      UI_IDS.difficultySelectModal
    );
    const scoringModal = document.getElementById(UI_IDS.scoringSelectModal);

    if (instructionsModal && !instructionsModal.classList.contains(CSS.HIDDEN))
      closeInstructions();
    if (difficultyModal && !difficultyModal.classList.contains(CSS.HIDDEN)) {
      difficultyModal.classList.add(CSS.HIDDEN);
      difficultyModal.setAttribute("aria-hidden", "true");
    }
    if (scoringModal && !scoringModal.classList.contains(CSS.HIDDEN)) {
      scoringModal.classList.add(CSS.HIDDEN);
      scoringModal.setAttribute("aria-hidden", "true");
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
  /* keep modal open */
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
window.startNewGame = () => initGame(); // legacy hook; now acts as Reset
window.closeInstructions = closeInstructions;

// Set up controls once JS loads (in case user never opens a modal)
ensureControlsUI();
