// ===== SQUARE WARS — ui.js =====
import {
  UI_IDS,
  CSS,
  CELL,
  GAP,
  GRID_PADDING,
  BORDER_WIDTH,
  PLAYER,
  SCORING_MODES,
} from "./constants.js";

/** Update header, scores, banner, and balance meter */
export function updateDisplay(
  currentPlayer,
  gameMode,
  aiDifficulty,
  scoringMode,
  redScore,
  blueScore
) {
  document.getElementById(UI_IDS.redGames).textContent = redScore;
  document.getElementById(UI_IDS.blueGames).textContent = blueScore;

  const redScoreEl = document.getElementById(UI_IDS.redScore);
  const blueScoreEl = document.getElementById(UI_IDS.blueScore);
  redScoreEl.classList.remove(CSS.LEADING);
  blueScoreEl.classList.remove(CSS.LEADING);
  if (redScore > blueScore) redScoreEl.classList.add(CSS.LEADING);
  else if (blueScore > redScore) blueScoreEl.classList.add(CSS.LEADING);

  const total = Math.max(1, redScore + blueScore);
  const pctR = (redScore / total) * 100;
  const pctB = 100 - pctR;
  const meterR = document.getElementById("scoreMeterRed");
  const meterB = document.getElementById("scoreMeterBlue");
  if (meterR && meterB) {
    meterR.style.width = pctR + "%";
    meterB.style.width = pctB + "%";
  }

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

  updateLabelsForModeUI(gameMode, aiDifficulty, scoringMode);
}

/** Build the grid with delegated click handler */
export function buildGrid(rows, cols, onColumnClick) {
  const gameGrid = document.getElementById(UI_IDS.gameGrid);
  gameGrid.innerHTML = "";

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

  if (gameGrid._delegatedHandler) {
    gameGrid.removeEventListener("click", gameGrid._delegatedHandler);
  }
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
 * Update a single cell’s visuals.
 * NEW: animate a ghost chip from above; keep the real cell white until landing.
 */
export function updateCellDisplay(grid, blockedCells, _prevLastMove, row, col) {
  // drop any previous last-move markers
  document.querySelectorAll(".cell.last-move").forEach((el) => {
    el.classList.remove(CSS.LAST_MOVE);
    el.style.border = "";
  });

  const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  const player = grid[row][col];

  // keep the real cell white during the drop
  cell.className = "cell";
  cell.dataset.ghost = "1"; // tell full refresh to skip recoloring for now

  // Create a ghost chip positioned exactly above the cell
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  const cellRect = cell.getBoundingClientRect();
  const layerRect = outlineLayer.getBoundingClientRect();
  const left = cellRect.left - layerRect.left;
  const top = cellRect.top - layerRect.top;

  const ghost = document.createElement("div");
  ghost.className = `chip-ghost ${
    player === PLAYER.RED ? "red" : "blue"
  } drop-in`;
  ghost.style.left = `${left}px`;
  ghost.style.top = `${top}px`;
  ghost.style.setProperty("--drop-y", `${(row + 1) * (CELL + GAP)}px`);
  outlineLayer.appendChild(ghost);

  // When the ghost lands, color the real cell and clean up
  const finish = () => {
    ghost.remove();
    delete cell.dataset.ghost;

    if (grid[row][col] === PLAYER.RED) cell.className = "cell red";
    else if (grid[row][col] === PLAYER.BLUE) cell.className = "cell blue";
    else cell.className = "cell";

    const key = `${row}-${col}`;
    if (blockedCells.has(key)) {
      cell.classList.add("blocked");
      cell.style.border = "1px solid rgba(255,255,255,.4)";
    } else {
      cell.classList.remove("blocked");
      cell.classList.add(CSS.LAST_MOVE);
    }
  };

  ghost.addEventListener("animationend", finish, { once: true });
}

/** Refresh every cell (used after blocking areas) */
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

      // If this cell is in the middle of a ghost-drop, keep it white.
      if (cell.dataset.ghost === "1") {
        cell.className = "cell";
        continue;
      }

      cell.classList.remove(CSS.LAST_MOVE);

      if (grid[r][c] === PLAYER.RED) cell.className = "cell red";
      else if (grid[r][c] === PLAYER.BLUE) cell.className = "cell blue";
      else cell.className = "cell";

      const key = `${r}-${c}`;
      if (blockedCells.has(key)) cell.classList.add("blocked");
      else cell.classList.remove("blocked");
    }
  }

  // Re-apply last move marker if it's not blocked and not ghosted
  if (
    lastMovePosition &&
    !blockedCells.has(`${lastMovePosition.row}-${lastMovePosition.col}`)
  ) {
    const last = document.querySelector(
      `[data-row="${lastMovePosition.row}"][data-col="${lastMovePosition.col}"]`
    );
    if (last && last.dataset.ghost !== "1") last.classList.add(CSS.LAST_MOVE);
  }
}

/** Draw the hatched capture rectangle and confetti (unchanged) */
export function drawOutlineRect(minRow, maxRow, minCol, maxCol, player) {
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (!outlineLayer) return;

  const x = GRID_PADDING + minCol * (CELL + GAP) - BORDER_WIDTH - 1 - 2;
  const y = GRID_PADDING + minRow * (CELL + GAP) - BORDER_WIDTH - 1 - 2;
  const w = (maxCol - minCol + 1) * (CELL + GAP) - GAP + 2 * BORDER_WIDTH + 2;
  const h = (maxRow - minRow + 1) * (CELL + GAP) - GAP + 2 * BORDER_WIDTH + 2;

  const box = document.createElement("div");
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  box.style.width = `${w}px`;
  box.style.height = `${h}px`;
  box.className = "won-outline";
  box.setAttribute("data-owner", player === PLAYER.RED ? "red" : "blue");

  ["tl", "tr", "bl", "br"].forEach((pos) => {
    const c = document.createElement("i");
    c.className = `corner ${pos}`;
    box.appendChild(c);
  });

  ["tl", "tr", "bl", "br"].forEach((pos) => {
    const sc = document.createElement("div");
    sc.className = `sparkle-corner ${pos}`;
    for (let i = 0; i < 6; i++) sc.appendChild(document.createElement("span"));
    box.appendChild(sc);
    setTimeout(() => sc.remove(), 1500);
  });

  outlineLayer.appendChild(box);
}

/** Draw persistent sleek line through the winning connect-4 (unchanged) */
export function drawWinStrike(winningLine, player) {
  if (!winningLine || winningLine.length < 2) return;
  const outlineLayer = document.getElementById(UI_IDS.outlineLayer);
  if (!outlineLayer) return;

  const first = winningLine[0];
  const last = winningLine[winningLine.length - 1];

  const centerOf = (r, c) => ({
    x: GRID_PADDING + c * (CELL + GAP) + CELL / 2,
    y: GRID_PADDING + r * (CELL + GAP) + CELL / 2,
  });

  const p1 = centerOf(first.row, first.col);
  const p2 = centerOf(last.row, last.col);

  const dx = p2.x - p1.x,
    dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) + 2;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const line = document.createElement("div");
  line.className = `win-strike ${player === PLAYER.RED ? "red" : "blue"}`;
  line.style.left = `${p1.x}px`;
  line.style.top = `${p1.y - 2}px`;
  line.style.width = `${len}px`;
  line.style.transformOrigin = "left center";
  line.style.transform = `rotate(${angle}deg)`;
  outlineLayer.appendChild(line);
}

/* ------- Modals & labels (unchanged) ------- */
export function showEndGameModal(winnerLabel, redScore, blueScore) {
  const modal = document.getElementById(UI_IDS.endGameModal);
  const title = document.getElementById(UI_IDS.endGameTitle);
  const subtitle = document.getElementById(UI_IDS.endGameSubtitle);

  title.textContent = "Game Over";
  if (redScore === blueScore) {
    subtitle.innerHTML = `<strong style="color:white;">Draw</strong><br>Final Score: ${redScore} - ${blueScore}`;
  } else if (winnerLabel.includes("Red")) {
    subtitle.innerHTML = `<strong style="color:#ff4444;">${winnerLabel} Wins!</strong><br>Final Score: ${redScore} - ${blueScore}`;
  } else {
    subtitle.innerHTML = `<strong style="color:#4444ff;">${winnerLabel} Wins!</strong><br>Final Score: ${redScore} - ${blueScore}`;
  }

  modal.classList.remove(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "false");
}

export function hideEndGameModal() {
  const modal = document.getElementById(UI_IDS.endGameModal);
  modal.classList.add(CSS.HIDDEN);
  modal.setAttribute("aria-hidden", "true");
}

export function showInstructions(scoringMode) {
  const instructionsModal = document.getElementById(UI_IDS.instructionsModal);
  const body = document.getElementById("instructionsBody");

  const general =
    "Drop your discs into the grid and try to connect four in a row — horizontally, vertically, or diagonally. When a player connects four, that area of the board becomes blocked off with a glowing outline. The game continues until the board is full.";

  const classic =
    "<strong>Classic:</strong> each captured box scores <em>1 point</em>.";
  const area =
    "<strong>Territory Takedown:</strong> score the <em>number of squares</em> inside the captured zone. Overlaps can <em>steal</em> territory.";

  body.innerHTML = `${general}<br><br>${
    scoringMode === SCORING_MODES.AREA ? area : classic
  }`;

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

export function updateLabelsForModeUI(gameMode, aiDifficulty, scoringMode) {
  const gameTitle = document.getElementById(UI_IDS.gameTitle);
  const redLabel = document.getElementById(UI_IDS.redLabel);
  const blueLabel = document.getElementById(UI_IDS.blueLabel);

  const suffix =
    scoringMode === SCORING_MODES.AREA ? " — Territory Takedown" : " — Classic";

  if (gameMode === "single") {
    gameTitle.textContent = "SQUARE WARS SINGLEPLAYER" + suffix;
    redLabel.textContent = "You (Red)";
    if (aiDifficulty) {
      const difficultyName =
        aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1);
      blueLabel.textContent = `Computer (Blue) - ${difficultyName}`;
    } else {
      blueLabel.textContent = "Computer (Blue)";
    }
  } else if (gameMode === "multi") {
    gameTitle.textContent = "SQUARE WARS MULTIPLAYER" + suffix;
    redLabel.textContent = "Player 1 (Red)";
    blueLabel.textContent = "Player 2 (Blue)";
  } else {
    gameTitle.textContent = "SQUARE WARS";
  }
}
