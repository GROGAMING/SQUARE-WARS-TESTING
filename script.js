// ===== SQUARE WARS — script.js =====
const ROWS = 20;
const COLS = 30;
let grid = [];
let currentPlayer = 1; // 1 = red (human), 2 = blue (computer/player2)
let blockedCells = new Set();
let redGames = 0;
let blueGames = 0;
let gameActive = true;
let lastMovePosition = null;
let gameMode = null; // 'single' or 'multi'
let aiDifficulty = null; // 'beginner', 'medium', 'advanced'

// Global function to set game mode
function setGameMode(mode) {
  gameMode = mode;
  const modeModal = document.getElementById("modeSelectModal");

  modeModal.classList.add("hidden");

  // If single player, show difficulty modal, otherwise show instructions
  if (mode === "single") {
    const difficultyModal = document.getElementById("difficultySelectModal");
    difficultyModal.classList.remove("hidden");
    difficultyModal.setAttribute("aria-hidden", "false");
  } else {
    updateLabelsForMode();
    showInstructions();
  }
}

// Global function to set difficulty
function setDifficulty(difficulty) {
  aiDifficulty = difficulty;
  const difficultyModal = document.getElementById("difficultySelectModal");

  difficultyModal.classList.add("hidden");
  difficultyModal.setAttribute("aria-hidden", "true");

  updateLabelsForMode();
  showInstructions();
}

// Helper function to show instructions modal
function showInstructions() {
  const instructionsModal = document.getElementById("instructionsModal");
  instructionsModal.classList.remove("hidden");
  instructionsModal.setAttribute("aria-hidden", "false");
}

// Update labels based on game mode
function updateLabelsForMode() {
  const gameTitle = document.getElementById("gameTitle");
  const redLabel = document.getElementById("redLabel");
  const blueLabel = document.getElementById("blueLabel");

  if (gameMode === "single") {
    gameTitle.textContent = "SQUARE WARS SINGLEPLAYER";
    redLabel.textContent = "You (Red)";
    // Show difficulty in label
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

// Global function to close instructions modal
function closeInstructions() {
  const modal = document.getElementById("instructionsModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    initGame();
  }
}

function drawOutlineRect(minRow, maxRow, minCol, maxCol, player) {
  const outlineLayer = document.getElementById("outlineLayer");
  if (!outlineLayer) return;

  const CELL = 20;
  const GAP = 2;
  const GRID_PADDING = 8;
  const BORDER_WIDTH = 1;

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

  if (player === 1) {
    box.style.backgroundColor = "rgba(255, 68, 68, 0.3)";
    box.style.borderColor = "rgba(255, 68, 68, 0.8)";
  } else if (player === 2) {
    box.style.backgroundColor = "rgba(68, 68, 255, 0.3)";
    box.style.borderColor = "rgba(68, 68, 255, 0.8)";
  }

  box.className = "won-outline";
  outlineLayer.appendChild(box);
}

function initGame() {
  grid = [];
  for (let row = 0; row < ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < COLS; col++) {
      grid[row][col] = 0;
    }
  }

  currentPlayer = 1;
  blockedCells = new Set();
  gameActive = true;
  lastMovePosition = null;

  const outlineLayer = document.getElementById("outlineLayer");
  if (outlineLayer) outlineLayer.innerHTML = "";

  createGrid();
  updateDisplay();
}

function createGrid() {
  const gameGrid = document.getElementById("gameGrid");
  gameGrid.innerHTML = "";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.onclick = () => {
        if (gameActive) {
          if (gameMode === "single" && currentPlayer === 1) {
            dropPiece(col);
          } else if (gameMode === "multi") {
            dropPiece(col);
          }
        }
      };
      gameGrid.appendChild(cell);
    }
  }
}

function dropPiece(col) {
  if (!gameActive) return;

  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row][col] === 0 && !blockedCells.has(`${row}-${col}`)) {
      grid[row][col] = currentPlayer;
      lastMovePosition = { row, col };
      updateCellDisplay(row, col);

      if (checkForWin(row, col)) {
        if (currentPlayer === 1) {
          redGames++;
          currentPlayer = 2;
        } else {
          blueGames++;
          currentPlayer = 1;
        }
      } else {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
      }

      updateDisplay();
      checkEndOfGame();

      if (gameMode === "single" && currentPlayer === 2 && gameActive) {
        setTimeout(makeComputerMove, 500);
      }

      return;
    }
  }
}

function makeComputerMove() {
  if (!gameActive || currentPlayer !== 2 || gameMode !== "single") return;

  const bestCol = getBestMove();
  if (bestCol !== -1) {
    dropPiece(bestCol);
  }
}

// Check if a cell is playable (considering gravity)
function isPlayableCell(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (blockedCells.has(`${r}-${c}`)) return false;
  if (grid[r][c] !== 0) return false;
  return getDropRow(c) === r;
}

// Scan for human two-in-a-row threats
function findOpenTwoThreatBlock() {
  const player = 1;
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  const candidates = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== player) continue;

      for (const [dr, dc] of dirs) {
        const r2 = r + dr,
          c2 = c + dc;
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) continue;
        if (grid[r2][c2] !== player) continue;

        const leftR = r - dr,
          leftC = c - dc;
        const rightR = r2 + dr,
          rightC = c2 + dc;

        if (isPlayableCell(leftR, leftC)) {
          candidates.push(leftC);
        }
        if (isPlayableCell(rightR, rightC)) {
          candidates.push(rightC);
        }
      }
    }
  }

  if (candidates.length === 0) return -1;

  const center = COLS / 2;
  candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return candidates[0];
}

// Master AI function
function getBestMove() {
  if (!aiDifficulty) return getBestMoveMedium();

  switch (aiDifficulty) {
    case "beginner":
      return getBestMoveBeginner();
    case "medium":
      return getBestMoveMedium();
    case "advanced":
      return getBestMoveAdvanced();
    default:
      return getBestMoveMedium();
  }
}

// Beginner AI
function getBestMoveBeginner() {
  // Take immediate win
  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      const row = getDropRow(col);
      grid[row][col] = 2;
      if (checkForWinSimulation(row, col, 2)) {
        grid[row][col] = 0;
        return col;
      }
      grid[row][col] = 0;
    }
  }

  // Sometimes block immediate threats (60% chance)
  if (Math.random() < 0.6) {
    const blockingMove = findImmediateThreat();
    if (blockingMove !== -1) {
      return blockingMove;
    }
  }

  // Otherwise random with slight center preference
  const availableCols = [];
  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      const centerDistance = Math.abs(col - COLS / 2);
      const weight = Math.max(1, 4 - Math.floor(centerDistance / 3));
      for (let i = 0; i < weight; i++) {
        availableCols.push(col);
      }
    }
  }

  if (availableCols.length === 0) return -1;
  return availableCols[Math.floor(Math.random() * availableCols.length)];
}

// Medium Difficulty AI
function getBestMoveMedium() {
  const depth = 3;

  const openTwoBlock = findOpenTwoThreatBlock();
  if (openTwoBlock !== -1) {
    if (Math.random() < 0.9) {
      return openTwoBlock;
    }
  }

  const blockingMove = findImmediateThreat();
  if (blockingMove !== -1) {
    return blockingMove;
  }

  const moves = [];

  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      const row = getDropRow(col);

      grid[row][col] = 2;
      let score = minimax(grid, depth - 1, false, -Infinity, Infinity);

      const centerBonus = Math.max(0, 5 - Math.abs(col - COLS / 2)) * 2;
      score += centerBonus;

      grid[row][col] = 0;
      moves.push({ col, score });
    }
  }

  if (moves.length === 0) return -1;

  moves.sort((a, b) => b.score - a.score);

  const randomFactor = Math.random();

  if (randomFactor < 0.05) {
    const bottomQuarter = moves.slice(Math.floor(moves.length * 0.75));
    if (bottomQuarter.length > 0) {
      return bottomQuarter[Math.floor(Math.random() * bottomQuarter.length)]
        .col;
    }
    const decentMoves = moves.slice(1, Math.min(5, moves.length));
    return decentMoves[
      Math.floor(Math.random() * Math.max(1, decentMoves.length))
    ].col;
  } else if (randomFactor < 0.45) {
    const decentMoves = moves.slice(1, Math.min(5, moves.length));
    if (decentMoves.length > 0) {
      return decentMoves[Math.floor(Math.random() * decentMoves.length)].col;
    }
    return moves[0].col;
  } else {
    return moves[0].col;
  }
}

// Advanced AI
function getBestMoveAdvanced() {
  const depth = 4;

  // Immediate wins
  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      const row = getDropRow(col);
      grid[row][col] = 2;
      if (checkForWinSimulation(row, col, 2)) {
        grid[row][col] = 0;
        return col;
      }
      grid[row][col] = 0;
    }
  }

  // Block immediate threats
  const blockingMove = findImmediateThreat();
  if (blockingMove !== -1) {
    return blockingMove;
  }

  // Block open-two threats 95% of the time
  const openTwoBlock = findOpenTwoThreatBlock();
  if (openTwoBlock !== -1) {
    if (Math.random() < 0.95) {
      return openTwoBlock;
    }
  }

  const candidateMoves = getCandidateMovesOrdered();
  const moves = [];

  for (let col of candidateMoves) {
    if (canDropInColumn(col)) {
      const row = getDropRow(col);

      grid[row][col] = 2;
      let score = minimaxAdvanced(grid, depth - 1, false, -Infinity, Infinity);

      const centerBonus = Math.max(0, 8 - Math.abs(col - COLS / 2)) * 3;
      score += centerBonus;

      grid[row][col] = 0;
      moves.push({ col, score });
    }
  }

  if (moves.length === 0) return -1;

  moves.sort((a, b) => b.score - a.score);

  // 85% best move, 12% second-best, 3% third-best
  const randomFactor = Math.random();
  if (randomFactor < 0.85) {
    return moves[0].col;
  } else if (randomFactor < 0.97) {
    return moves.length > 1 ? moves[1].col : moves[0].col;
  } else {
    return moves.length > 2 ? moves[2].col : moves[0].col;
  }
}

// Get ordered candidate moves for performance optimization
function getCandidateMovesOrdered() {
  const candidates = [];
  const center = Math.floor(COLS / 2);

  for (let offset = 0; offset <= center; offset++) {
    if (offset === 0) {
      if (canDropInColumn(center)) candidates.push(center);
    } else {
      if (center - offset >= 0 && canDropInColumn(center - offset)) {
        candidates.push(center - offset);
      }
      if (center + offset < COLS && canDropInColumn(center + offset)) {
        candidates.push(center + offset);
      }
    }

    if (candidates.length >= 12) break;
  }

  return candidates;
}

// Advanced minimax with better evaluation
function minimaxAdvanced(board, depth, isMaximizing, alpha, beta) {
  if (depth === 0 || isTerminalNodeAdvanced(board)) {
    return evaluateBoardAdvanced(board);
  }

  const candidateMoves = getCandidateMovesOrdered();

  if (isMaximizing) {
    let maxEval = -Infinity;

    for (let col of candidateMoves) {
      if (canDropInColumn(col)) {
        const row = getDropRow(col);
        board[row][col] = 2;
        const evalScore = minimaxAdvanced(board, depth - 1, false, alpha, beta);
        board[row][col] = 0;

        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);

        if (beta <= alpha) break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;

    for (let col of candidateMoves) {
      if (canDropInColumn(col)) {
        const row = getDropRow(col);
        board[row][col] = 1;
        const evalScore = minimaxAdvanced(board, depth - 1, true, alpha, beta);
        board[row][col] = 0;

        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);

        if (beta <= alpha) break;
      }
    }
    return minEval;
  }
}

// Enhanced board evaluation for advanced AI
function evaluateBoardAdvanced(board) {
  let score = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] !== 0 && !blockedCells.has(`${row}-${col}`)) {
        score += evaluatePositionAdvanced(board, row, col, board[row][col]);
      }
    }
  }

  return score;
}

// Enhanced position evaluation
function evaluatePositionAdvanced(board, row, col, player) {
  let totalScore = 0;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let [dRow, dCol] of directions) {
    const lineScore = evaluateLineAdvanced(board, row, col, dRow, dCol, player);
    totalScore += lineScore;
  }

  totalScore += getPositionalScoreAdvanced(row, col, player);
  return totalScore;
}

// Enhanced line evaluation
function evaluateLineAdvanced(board, startRow, startCol, dRow, dCol, player) {
  const prevRow = startRow - dRow;
  const prevCol = startCol - dCol;

  if (
    prevRow >= 0 &&
    prevRow < ROWS &&
    prevCol >= 0 &&
    prevCol < COLS &&
    board[prevRow][prevCol] === player &&
    !blockedCells.has(`${prevRow}-${prevCol}`)
  ) {
    return 0;
  }

  let consecutiveCount = 1;
  let openEnds = 0;

  let r = startRow + dRow;
  let c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === player &&
    !blockedCells.has(`${r}-${c}`) &&
    consecutiveCount < 4
  ) {
    consecutiveCount++;
    r += dRow;
    c += dCol;
  }

  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    openEnds++;
  }

  r = startRow - dRow;
  c = startCol - dCol;
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    openEnds++;
  }

  let score = 0;
  if (consecutiveCount >= 4) {
    score = 10000;
  } else if (consecutiveCount === 3) {
    score = openEnds > 0 ? 500 : 100;
  } else if (consecutiveCount === 2) {
    score = openEnds > 1 ? 50 : 20;
  } else {
    score = 5;
  }

  return player === 2 ? score : -score;
}

// Enhanced positional scoring
function getPositionalScoreAdvanced(row, col, player) {
  let score = 0;

  const centerDistance = Math.abs(col - COLS / 2);
  score += Math.max(0, 15 - centerDistance * 2);

  score += (ROWS - row) * 2;
  score += getConnectivityBonusAdvanced(row, col, player);

  return player === 2 ? score : -score * 0.9;
}

// Enhanced connectivity bonus
function getConnectivityBonusAdvanced(row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let connectivityScore = 0;

  for (let [dRow, dCol] of directions) {
    let potentialLength = 1;

    for (let dir of [-1, 1]) {
      let r = row + dRow * dir;
      let c = col + dCol * dir;
      let steps = 0;

      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        steps < 3 &&
        !blockedCells.has(`${r}-${c}`) &&
        (grid[r][c] === 0 || grid[r][c] === player)
      ) {
        if (grid[r][c] === player) potentialLength++;
        r += dRow * dir;
        c += dCol * dir;
        steps++;
      }
    }

    if (potentialLength >= 3) {
      connectivityScore += potentialLength * 2;
    }
  }

  return connectivityScore;
}

// Enhanced terminal node detection for advanced AI
function isTerminalNodeAdvanced(board) {
  for (let row = Math.max(0, ROWS - 10); row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] !== 0 && !blockedCells.has(`${row}-${col}`)) {
        if (checkForWinSimulation(row, col, board[row][col])) {
          return true;
        }
      }
    }
  }

  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      return false;
    }
  }

  return true;
}

function findImmediateThreat() {
  for (let col = 0; col < COLS; col++) {
    if (canDropInColumn(col)) {
      const row = getDropRow(col);
      grid[row][col] = 1;

      if (checkForWinSimulation(row, col, 1)) {
        grid[row][col] = 0;
        return col;
      }

      grid[row][col] = 0;
    }
  }
  return -1;
}

function minimax(board, depth, isMaximizing, alpha, beta) {
  if (depth === 0 || isTerminalNode(board)) {
    return evaluateBoard(board);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;

    for (let col = 0; col < COLS; col++) {
      if (canDropInColumn(col)) {
        const row = getDropRow(col);
        board[row][col] = 2;
        const evalScore = minimax(board, depth - 1, false, alpha, beta);
        board[row][col] = 0;

        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);

        if (beta <= alpha) break;
      }
    }
    return maxEval;
  } else {
    let minEval = Infinity;

    for (let col = 0; col < COLS; col++) {
      if (canDropInColumn(col)) {
        const row = getDropRow(col);
        board[row][col] = 1;
        const evalScore = minimax(board, depth - 1, true, alpha, beta);
        board[row][col] = 0;

        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);

        if (beta <= alpha) break;
      }
    }
    return minEval;
  }
}

function evaluateBoard(board) {
  let score = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] !== 0 && !blockedCells.has(`${row}-${col}`)) {
        score += evaluatePosition(board, row, col, board[row][col]);
      }
    }
  }

  return score;
}

function evaluatePosition(board, row, col, player) {
  let totalScore = 0;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let [dRow, dCol] of directions) {
    const lineScore = evaluateLine(board, row, col, dRow, dCol, player);
    totalScore += lineScore;
  }

  totalScore += getPositionalScore(row, col, player);
  return totalScore;
}

function evaluateLine(board, startRow, startCol, dRow, dCol, player) {
  const prevRow = startRow - dRow;
  const prevCol = startCol - dCol;

  if (
    prevRow >= 0 &&
    prevRow < ROWS &&
    prevCol >= 0 &&
    prevCol < COLS &&
    board[prevRow][prevCol] === player &&
    !blockedCells.has(`${prevRow}-${prevCol}`)
  ) {
    return 0;
  }

  let consecutiveCount = 1;
  let openEnds = 0;

  let r = startRow + dRow;
  let c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === player &&
    !blockedCells.has(`${r}-${c}`) &&
    consecutiveCount < 4
  ) {
    consecutiveCount++;
    r += dRow;
    c += dCol;
  }

  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    openEnds++;
  }

  r = startRow - dRow;
  c = startCol - dCol;
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  ) {
    openEnds++;
  }

  let score = 0;
  if (consecutiveCount >= 4) {
    score = 1000;
  } else if (consecutiveCount === 3) {
    score = openEnds > 0 ? 60 : 30;
  } else if (consecutiveCount === 2) {
    score = openEnds > 1 ? 15 : 8;
  } else {
    score = 2;
  }

  return player === 2 ? score : -score * 0.9;
}

function getPositionalScore(row, col, player) {
  let score = 0;

  const centerDistance = Math.abs(col - COLS / 2);
  score += Math.max(0, 8 - centerDistance);

  score += (ROWS - row) * 0.5;
  score += getConnectivityBonus(row, col, player) * 0.3;

  return player === 2 ? score : -score * 0.8;
}

function getConnectivityBonus(row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let connectivityScore = 0;

  for (let [dRow, dCol] of directions) {
    let potentialLength = 1;

    for (let dir of [-1, 1]) {
      let r = row + dRow * dir;
      let c = col + dCol * dir;
      let steps = 0;

      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        steps < 3 &&
        !blockedCells.has(`${r}-${c}`) &&
        (grid[r][c] === 0 || grid[r][c] === player)
      ) {
        if (grid[r][c] === player) potentialLength++;
        r += dRow * dir;
        c += dCol * dir;
        steps++;
      }
    }

    if (potentialLength >= 3) {
      connectivityScore += potentialLength;
    }
  }

  return connectivityScore;
}

function isTerminalNode(board) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] !== 0 && !blockedCells.has(`${row}-${col}`)) {
        if (checkForWinSimulation(row, col, board[row][col])) {
          return true;
        }
      }
    }
  }

  let hasValidMove = false;
  for (let col = 0; col < COLS && !hasValidMove; col++) {
    if (canDropInColumn(col)) {
      hasValidMove = true;
    }
  }

  return !hasValidMove;
}

function canDropInColumn(col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row][col] === 0 && !blockedCells.has(`${row}-${col}`)) {
      return true;
    }
  }
  return false;
}

function hasAnyValidMove() {
  for (let col = 0; col < COLS; col++) if (canDropInColumn(col)) return true;
  return false;
}

function getWinnerLabel() {
  if (redGames > blueGames)
    return gameMode === "single" ? "You (Red)" : "Player 1 (Red)";
  if (blueGames > redGames) {
    if (gameMode === "single") {
      const diff = aiDifficulty
        ? ` - ${aiDifficulty.charAt(0).toUpperCase() + aiDifficulty.slice(1)}`
        : "";
      return `Computer (Blue)${diff}`;
    }
    return "Player 2 (Blue)";
  }
  return "Tie";
}

function showEndGameModal() {
  gameActive = false;
  const modal = document.getElementById("endGameModal");
  const title = document.getElementById("endGameTitle");
  const subtitle = document.getElementById("endGameSubtitle");
  const winnerLabel = getWinnerLabel();

  title.textContent = "Game Over";

  // Create scoreboard display
  if (redGames === blueGames) {
    // Draw - white text
    subtitle.innerHTML = `<strong style="color: white;">Draw</strong><br>Final Score: ${redGames} - ${blueGames}`;
  } else if (redGames > blueGames) {
    // Red wins - red text
    subtitle.innerHTML = `<strong style="color: #ff4444;">${winnerLabel} Wins!</strong><br>Final Score: ${redGames} - ${blueGames}`;
  } else {
    // Blue wins - blue text
    subtitle.innerHTML = `<strong style="color: #4444ff;">${winnerLabel} Wins!</strong><br>Final Score: ${redGames} - ${blueGames}`;
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function hideEndGameModal() {
  const modal = document.getElementById("endGameModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function checkEndOfGame() {
  if (!hasAnyValidMove()) showEndGameModal();
}

function getDropRow(col) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (grid[row][col] === 0 && !blockedCells.has(`${row}-${col}`)) {
      return row;
    }
  }
  return -1;
}

function checkForWinSimulation(row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let [dRow, dCol] of directions) {
    const line = getLine(row, col, dRow, dCol, player);
    if (line.length >= 4) {
      return true;
    }
  }
  return false;
}

function updateCellDisplay(row, col) {
  const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);

  document
    .querySelectorAll(".cell")
    .forEach((c) => c.classList.remove("last-move"));

  if (grid[row][col] === 1) {
    cell.className = "cell red";
  } else if (grid[row][col] === 2) {
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
    cell.classList.add("last-move");
  }

  if (!cell.classList.contains("last-move")) {
    cell.style.border = "1px solid rgba(255, 255, 255, 0.4)";
  }
}

function updateAllCellDisplays() {
  document
    .querySelectorAll(".cell")
    .forEach((c) => c.classList.remove("last-move"));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      updateCellDisplay(row, col);
    }
  }
}

function checkForWin(row, col) {
  const player = grid[row][col];
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let [dRow, dCol] of directions) {
    const line = getLine(row, col, dRow, dCol, player);
    if (line.length >= 4) {
      boxOffConnectedArea(line, player);
      return true;
    }
  }
  return false;
}

function getLine(startRow, startCol, dRow, dCol, player) {
  const line = [{ row: startRow, col: startCol }];

  let r = startRow + dRow;
  let c = startCol + dCol;
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
    if (!blockedCells.has(`${row}-${col}`)) {
      connectedSquares.add(`${row}-${col}`);
    }
  });

  while (queue.length > 0) {
    const { row, col } = queue.shift();

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;

        const newRow = row + dr;
        const newCol = col + dc;
        const key = `${newRow}-${newCol}`;

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
      if (!blockedCells.has(key)) {
        blockedCells.add(key);
      }
    }
  }

  updateAllCellDisplays();
  drawOutlineRect(minRow, maxRow, minCol, maxCol, player);
}

function updateDisplay() {
  document.getElementById("redGames").textContent = redGames;
  document.getElementById("blueGames").textContent = blueGames;

  const redScore = document.getElementById("redScore");
  const blueScore = document.getElementById("blueScore");

  redScore.classList.remove("leading");
  blueScore.classList.remove("leading");

  if (redGames > blueGames) {
    redScore.classList.add("leading");
  } else if (blueGames > redGames) {
    blueScore.classList.add("leading");
  }

  const currentPlayerSpan = document.getElementById("currentPlayer");
  const currentPlayerBanner = document.getElementById("currentPlayerBanner");

  currentPlayerBanner.classList.remove("player1-turn", "player2-turn");

  if (currentPlayer === 1) {
    if (gameMode === "single") {
      currentPlayerSpan.textContent = "You (Red)";
    } else {
      currentPlayerSpan.textContent = "Player 1 (Red)";
    }
    currentPlayerSpan.className = "player1";
    currentPlayerBanner.classList.add("player1-turn");
  } else {
    if (gameMode === "single") {
      currentPlayerSpan.textContent = "Computer (Blue)";
      currentPlayerSpan.className = "player2 computer-turn";
    } else {
      currentPlayerSpan.textContent = "Player 2 (Blue)";
      currentPlayerSpan.className = "player2";
    }
    currentPlayerBanner.classList.add("player2-turn");
  }
}

function startNewGame() {
  const outlineLayer = document.getElementById("outlineLayer");
  if (outlineLayer) outlineLayer.innerHTML = "";

  redGames = 0;
  blueGames = 0;

  initGame();
}

// Keyboard & modal listeners
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const instructionsModal = document.getElementById("instructionsModal");
    const difficultyModal = document.getElementById("difficultySelectModal");

    if (instructionsModal && !instructionsModal.classList.contains("hidden")) {
      closeInstructions();
    }
    if (difficultyModal && !difficultyModal.classList.contains("hidden")) {
      difficultyModal.classList.add("hidden");
      difficultyModal.setAttribute("aria-hidden", "true");
    }
  }
});

document.getElementById("instructionsModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeInstructions();
});

// Add event listener for difficulty modal
document
  .getElementById("difficultySelectModal")
  .addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add("hidden");
      e.currentTarget.setAttribute("aria-hidden", "True");
    }
  });

document.getElementById("endGameModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    /* keep modal open on backdrop click */
  }
});

document.getElementById("tryAgainBtn").addEventListener("click", () => {
  hideEndGameModal();
  redGames = 0;
  blueGames = 0;
  initGame();
  updateDisplay();
});

document.getElementById("changeModeBtn").addEventListener("click", () => {
  hideEndGameModal();
  const outlineLayer = document.getElementById("outlineLayer");
  if (outlineLayer) outlineLayer.innerHTML = "";
  redGames = 0;
  blueGames = 0;
  gameActive = false;
  gameMode = null;
  aiDifficulty = null;
  updateLabelsForMode();
  const modeModal = document.getElementById("modeSelectModal");
  modeModal.classList.remove("hidden");
  modeModal.setAttribute("aria-hidden", "false");
  updateDisplay();
});

// Expose functions to the global scope so inline onclick can call them (safety in some bundlers)
window.setGameMode = setGameMode;
window.setDifficulty = setDifficulty;
window.startNewGame = startNewGame;
window.closeInstructions = closeInstructions;

// ===== end of script.js =====
