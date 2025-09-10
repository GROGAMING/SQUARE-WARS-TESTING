// ===== SQUARE WARS — ui.js =====
import {
  UI_IDS,
  CSS,
  CELL,
  GAP,
  GRID_PADDING,
  BORDER_WIDTH,
  PLAYER,
} from "./constants.js";

/**
 * Update the game header, scores, and current-player banner.
 */
export function updateDisplay(currentPlayer, gameMode, aiDifficulty, redGames, blueGames) {
  document.getElementById(UI_IDS.redGames).textContent = redGames;
  document.getElementById(UI_IDS.blueGames).textContent = blueGames;

  const redScore = document.getElementById(UI_IDS.redScore);
  const blueScore = document.getElementById(UI_IDS.blueScore);

  redScore.classList.remove(CSS.LEADING);
  blueScore.classList.remove(CSS.LEADING);

  if (redGames > blueGames) redScore.classList.add(CSS.LEADING);
  else if (blueGames > redGames) blueScore.classList.add(CSS.LEADING);

  const currentPlayerSpan = document.getElementById(UI_IDS.currentPlayer);
  const currentPlayerBanner = document.getElementById(UI_IDS.currentPlayerBanner);

  currentPlayerBanner.classList.remove(CSS.PLAYER1_TURN, CSS.PLAYER2_TURN);

  if (currentPlayer === PLAYER.RED) {
    currentPlayerSpan.textContent =
      gameMode === "single" ? "You (Red)" : "Player 1 (Red)";
    currentPlayerSpan.className = CSS.PLAYER1;
    currentPlayerBanner.classList.add(CSS.PLAYER1_TURN);
  } else {
    if (gameMode === "single") {
      currentPlayerSpan.textContent = "Computer (Blue)";
      currentPlayerSpan.className = `${CSS.PLAYER2} ${CSS.COMPUTER_TURN}`;
    } else {
      currentPlayerSpan.textContent = "Player 2 (Blue)";
      currentPlayerSpan.className = CSS.PLAYER2;
    }
    currentPlayerBanner.classList.add(CSS.PLAYER2_TURN);
  }
}

/**
 * Build the clickable grid. Calls onColumnClick(col) when a cell is clicked.
 */
export function buildGrid(rows, cols, onColumnClick) {
  const gameGrid = document.getElementById(UI_IDS.gameGrid);
  gameGrid.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.onclick = () => onColumnClick(c);
      gameGrid.appendChild(cell);
    }
  }
}

/**
 * Visual update of a single cell.
 */
export function updateCellDisplay(grid, blockedCells, lastMovePosition, row, col) {
  const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  document.querySelectorAll(".cell").forEach((c) => c.classList.remove(CSS.LAST_MOVE));

  if (grid[row][col] === PLAYER.RED) {
    cell.className = "cell red";
  } else if (grid[row][col] === PLAYER.BLUE) {
    cell.className = "cell blue";
  } else {
    cell.className = "cell";
  }

  if (
    lastMovePosition &&
    lastMovePosition.row === row &&
    lastMovePosition.col === col &&
    !blockedCells.has(`${row}-${col}`)
  ) {
    cell.classList.add(CSS.LAST_MOVE);
  }

  if (!cell.classList.contains(CSS.LAST_MOVE)) {
    cell.style.border = "1px solid rgba(255, 255, 255, 0.4)";
  }
}

/**
 * Update every cell’s visuals.
 */
export function updateAllCellDisplays(grid, blockedCells, lastMovePosition, rows, cols) {
  document.querySelectorAll(".cell").forEach((c) => c.classList.remove(CSS.LAST_MOVE));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      updateCellDisplay(grid, blockedCells, lastMovePosition, r, c);
    }
  }
}

/**
 * Draw the “won” rectangle overlay.
 */
export function drawOutlineRect(minRow, maxRow, minCol, maxCol, player) {
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (!outlineLayer) return;

  const x = GRID_PADDING + minCol * (CELL + GAP) - BORDER_WIDTH - 1 - 2;
  const y = GRID_PADDING + minRow * (CELL + GAP) - BORDER_WIDTH - 1 - 2;
  const w = (maxCol - minCol + 1) * (CELL + GAP) - GAP + 2 * BORDER_WIDTH + 2;
  const h = (maxRow - minRow + 1) * (CELL + GAP) - GAP + 2 * BORDER_WIDTH + 2;

  const box = document.createElement("div");
  box.style.position = "absolute";
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.width = `${w}px`;
  box.style.height = `${h}px`;
  box.style.border = "3px solid rgba(0, 0, 0, 0.8)";
  box.style.borderRadius = "6px";
  box.style.boxSizing = "border-box";
  box.style.pointerEvents = "none";
  box.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.3)";

  if (player === PLAYER.RED) {
    box.style.backgroundColor = "rgba(255, 68, 68, 0.3)";
    box.style.borderColor = "rgba(255, 68, 68, 0.8)";
  } else if (player === PLAYER.BLUE) {
    box.style.backgroundColor = "rgba(68, 68, 255, 0.3)";
    box.style.borderColor = "rgba(68, 68, 255, 0.8)";
  }

  box.className = "won-outline";
  outlineLayer.appendChild(box);
}

/**
 * Show / hide end-game modal (content passed in by main file).
 */
export function showEndGameModal(winnerLabel, redGames, blueGames) {
  const modal = document.getElementById(UI_IDS.endGameModal);
  const title = document.getElementById(UI_IDS.endGameTitle);
  const subtitle = document.getElementById(UI_IDS.endGameSubtitle);

  title.textContent = "Game Over";

  if (redGames === blueGames) {
    subtitle.innerHTML = `<strong style="color: white;">Draw</strong><br>Final Score: ${redGames} - ${blueGames}`;
  } else if (winnerLabel.includes("Red")) {
    subtitle.innerHTML = `<strong style="color: #ff4444;">${winnerLabel} Wins!</strong><br>Final Score: ${redGames} - ${blueGames}`;
  } else {
    subtitle.innerHTML = `<strong style="color: #4444ff;">${winnerLabel} Wins!</strong><br>Final Score: ${redGames} - ${blueGames}`;
  }

  modal.classList.remove(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "false");
}

export function hideEndGameModal() {
  const modal = document.getElementById(UI_IDS.endGameModal);
  modal.classList.add(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "true");
}

/**
 * Show instructions modal.
 */
export function showInstructions() {
  const instructionsModal = document.getElementById(UI_IDS.instructionsModal);
  instructionsModal.classList.remove(CSS.HIDDEN);
  instructionsModal.setAttribute("aria-hidden", "false");
}

/**
 * Hide instructions modal and run a callback (usually initGame).
 */
export function closeInstructionsUI(afterCloseCallback) {
  const modal = document.getElementById(UI_IDS.instructionsModal);
  if (!modal) return;
  modal.classList.add(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "true");
  if (typeof afterCloseCallback === "function") afterCloseCallback();
}

/**
 * Update labels for mode & difficulty.
 */
export function updateLabelsForModeUI(gameMode, aiDifficulty) {
  const gameTitle = document.getElementById(UI_IDS.gameTitle);
  const redLabel = document.getElementById(UI_IDS.redLabel);
  const blueLabel = document.getElementById(UI_IDS.blueLabel);

  if (gameMode === "single") {
    gameTitle.textContent = "SQUARE WARS SINGLEPLAYER";
    redLabel.textContent = "You (Red)";
    if (aiDifficulty) {
      const difficultyName = aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1);
      blueLabel.textContent = `Computer (Blue) - ${difficultyName}`;
    } else {
      blueLabel.textContent = "Computer (Blue)";
    }
  } else {
    gameTitle.textContent = "SQUARE WARS MULTIPLAYER";
    redLabel.textContent = "Player 1 (Red)";
    blueLabel.textContent = "Player 2 (Blue)";
  }
}
