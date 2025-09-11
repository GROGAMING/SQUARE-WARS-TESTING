// ===== SQUARE WARS — ui.js (delegated clicks + single last-move + 50% shaded win box) =====
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
export function updateDisplay(
  currentPlayer,
  gameMode,
  aiDifficulty,
  redGames,
  blueGames
) {
  document.getElementById(UI_IDS.redGames).textContent = redGames;
  document.getElementById(UI_IDS.blueGames).textContent = blueGames;

  const redScore = document.getElementById(UI_IDS.redScore);
  const blueScore = document.getElementById(UI_IDS.blueScore);

  redScore.classList.remove(CSS.LEADING);
  blueScore.classList.remove(CSS.LEADING);

  if (redGames > blueGames) redScore.classList.add(CSS.LEADING);
  else if (blueGames > redGames) blueScore.classList.add(CSS.LEADING);

  const currentPlayerSpan = document.getElementById(UI_IDS.currentPlayer);
  const currentPlayerBanner = document.getElementById(
    UI_IDS.currentPlayerBanner
  );

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
 * Build the clickable grid using event delegation.
 * We attach ONE listener to #gameGrid instead of 600 per-cell handlers.
 */
export function buildGrid(rows, cols, onColumnClick) {
  const gameGrid = document.getElementById(UI_IDS.gameGrid);
  gameGrid.innerHTML = "";

  // Build cells quickly with a fragment
  const frag = document.createDocumentFragment();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      frag.appendChild(cell);
    }
  }
  gameGrid.appendChild(frag);

  // Remove previous delegated handler (if any) so we don’t stack listeners
  if (gameGrid._delegatedHandler) {
    gameGrid.removeEventListener("click", gameGrid._delegatedHandler);
  }

  // One listener for the whole grid
  const handler = (e) => {
    const target = e.target.closest(".cell");
    if (!target || !gameGrid.contains(target)) return;
    const col = Number(target.dataset.col);
    if (!Number.isNaN(col)) onColumnClick(col);
  };
  gameGrid.addEventListener("click", handler);
  gameGrid._delegatedHandler = handler;
}

/**
 * Visual update of a single cell.
 * Ensure ONLY ONE cell has .last-move by removing it from all cells first.
 */
export function updateCellDisplay(grid, blockedCells, _prevLastMove, row, col) {
  // Drop any existing last-move markers
  document.querySelectorAll(".cell.last-move").forEach((el) => {
    el.classList.remove(CSS.LAST_MOVE);
    el.style.border = ""; // back to stylesheet default
  });

  const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  if (grid[row][col] === PLAYER.RED) {
    cell.className = "cell red";
  } else if (grid[row][col] === PLAYER.BLUE) {
    cell.className = "cell blue";
  } else {
    cell.className = "cell";
  }

  // Mark ONLY the new last move (unless it’s now blocked)
  if (!blockedCells.has(`${row}-${col}`)) {
    cell.classList.add(CSS.LAST_MOVE);
  } else {
    cell.style.border = "1px solid rgba(255, 255, 255, 0.4)";
  }
}

/**
 * Update every cell’s visuals (used after blocking areas).
 */
export function updateAllCellDisplays(
  grid,
  blockedCells,
  lastMovePosition,
  rows,
  cols
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      if (!cell) continue;

      cell.classList.remove(CSS.LAST_MOVE);

      if (grid[r][c] === PLAYER.RED) cell.className = "cell red";
      else if (grid[r][c] === PLAYER.BLUE) cell.className = "cell blue";
      else cell.className = "cell";
    }
  }

  // Re-apply last move marker once
  if (
    lastMovePosition &&
    !blockedCells.has(`${lastMovePosition.row}-${lastMovePosition.col}`)
  ) {
    const last = document.querySelector(
      `[data-row="${lastMovePosition.row}"][data-col="${lastMovePosition.col}"]`
    );
    if (last) last.classList.add(CSS.LAST_MOVE);
  }
}

/**
 * Draw the “won” rectangle overlay.
 *  - 50% shaded fill so the area reads as "completed"
 *  - Colored outline + glow that matches the winner
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
  box.style.border = "3px solid";
  box.style.borderRadius = "6px";
  box.style.boxSizing = "border-box";
  box.style.pointerEvents = "none";

  // Winner-tinted 50% fill + matching outline/glow
  if (player === PLAYER.RED) {
    box.style.backgroundColor = "rgba(255, 107, 107, 0.5)"; // #ff6b6b @ 50%
    box.style.borderColor = "#ff6b6b";
    box.style.boxShadow = "0 0 18px rgba(255,107,107,.55)";
  } else if (player === PLAYER.BLUE) {
    box.style.backgroundColor = "rgba(77, 171, 247, 0.5)"; // #4dabf7 @ 50%
    box.style.borderColor = "#4dabf7";
    box.style.boxShadow = "0 0 18px rgba(77,171,247,.55)";
  } else {
    // Fallback (shouldn't be used normally)
    box.style.backgroundColor = "rgba(255,255,255,0.35)";
    box.style.borderColor = "rgba(255,255,255,.7)";
    box.style.boxShadow = "0 0 18px rgba(255,255,255,.35)";
  }

  box.className = "won-outline";
  outlineLayer.appendChild(box);
}

/* ------- Modal helpers ------- */
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

export function showInstructions() {
  const instructionsModal = document.getElementById(UI_IDS.instructionsModal);
  instructionsModal.classList.remove(CSS.HIDDEN);
  instructionsModal.setAttribute("aria-hidden", "false");
}

export function closeInstructionsUI(afterCloseCallback) {
  const modal = document.getElementById(UI_IDS.instructionsModal);
  if (!modal) return;
  modal.classList.add(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "true");
  if (typeof afterCloseCallback === "function") afterCloseCallback();
}

export function updateLabelsForModeUI(gameMode, aiDifficulty) {
  const gameTitle = document.getElementById(UI_IDS.gameTitle);
  const redLabel = document.getElementById(UI_IDS.redLabel);
  const blueLabel = document.getElementById(UI_IDS.blueLabel);

  if (gameMode === "single") {
    gameTitle.textContent = "SQUARE WARS SINGLEPLAYER";
    redLabel.textContent = "You (Red)";
    if (aiDifficulty) {
      const difficultyName =
        aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1);
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
