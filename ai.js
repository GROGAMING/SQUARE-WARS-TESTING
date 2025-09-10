// ===== SQUARE WARS — ai.js =====
import { ROWS, COLS, PLAYER, DIRECTIONS, AI } from "./constants.js";

/**
 * Public API:
 *  chooseComputerMove({ grid, blockedCells, aiDifficulty })
 * Returns a column index or -1 if no move.
 */
export function chooseComputerMove({ grid, blockedCells, aiDifficulty }) {
  if (!aiDifficulty || aiDifficulty === "medium") {
    return getBestMoveMedium(grid, blockedCells);
  }
  if (aiDifficulty === "beginner") {
    return getBestMoveBeginner(grid, blockedCells);
  }
  if (aiDifficulty === "advanced") {
    return getBestMoveAdvanced(grid, blockedCells);
  }
  return getBestMoveMedium(grid, blockedCells);
}

/* ----------------- Core helpers (pure, no DOM) ----------------- */

function canDropInColumn(grid, blockedCells, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r][col] === 0 && !blockedCells.has(`${r}-${col}`)) return true;
  }
  return false;
}

function getDropRow(grid, blockedCells, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r][col] === 0 && !blockedCells.has(`${r}-${col}`)) return r;
  }
  return -1;
}

function isPlayableCell(grid, blockedCells, r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (blockedCells.has(`${r}-${c}`)) return false;
  if (grid[r][c] !== 0) return false;
  return getDropRow(grid, blockedCells, c) === r;
}

function getLineForSim(
  grid,
  blockedCells,
  startRow,
  startCol,
  dRow,
  dCol,
  player
) {
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

function checkForWinSimulation(grid, blockedCells, row, col, player) {
  for (let [dr, dc] of DIRECTIONS) {
    const line = getLineForSim(grid, blockedCells, row, col, dr, dc, player);
    if (line.length >= 4) return true;
  }
  return false;
}

function findImmediateThreat(grid, blockedCells) {
  // If RED can win next move, block it.
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const row = getDropRow(grid, blockedCells, col);

    grid[row][col] = PLAYER.RED;
    const willWin = checkForWinSimulation(
      grid,
      blockedCells,
      row,
      col,
      PLAYER.RED
    );
    grid[row][col] = 0;

    if (willWin) return col;
  }
  return -1;
}

function findOpenTwoThreatBlock(grid, blockedCells) {
  const player = PLAYER.RED;
  const candidates = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== player) continue;

      for (const [dr, dc] of DIRECTIONS) {
        const r2 = r + dr,
          c2 = c + dc;
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) continue;
        if (grid[r2][c2] !== player) continue;

        const leftR = r - dr,
          leftC = c - dc;
        const rightR = r2 + dr,
          rightC = c2 + dc;

        if (isPlayableCell(grid, blockedCells, leftR, leftC))
          candidates.push(leftC);
        if (isPlayableCell(grid, blockedCells, rightR, rightC))
          candidates.push(rightC);
      }
    }
  }

  if (candidates.length === 0) return -1;

  const center = COLS / 2;
  candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return candidates[0];
}

function getCandidateMovesOrdered(grid, blockedCells) {
  const candidates = [];
  const center = Math.floor(COLS / 2);

  for (let offset = 0; offset <= center; offset++) {
    if (offset === 0) {
      if (canDropInColumn(grid, blockedCells, center)) candidates.push(center);
    } else {
      if (
        center - offset >= 0 &&
        canDropInColumn(grid, blockedCells, center - offset)
      )
        candidates.push(center - offset);
      if (
        center + offset < COLS &&
        canDropInColumn(grid, blockedCells, center + offset)
      )
        candidates.push(center + offset);
    }
    if (candidates.length >= 12) break;
  }
  return candidates;
}

/* ----------------- Evaluation helpers ----------------- */

function evaluateLineAdvanced(
  board,
  blockedCells,
  startRow,
  startCol,
  dRow,
  dCol,
  player
) {
  const prevRow = startRow - dRow,
    prevCol = startCol - dCol;
  if (
    prevRow >= 0 &&
    prevRow < ROWS &&
    prevCol >= 0 &&
    prevCol < COLS &&
    board[prevRow][prevCol] === player &&
    !blockedCells.has(`${prevRow}-${prevCol}`)
  )
    return 0;

  let consecutiveCount = 1;
  let openEnds = 0;

  let r = startRow + dRow,
    c = startCol + dCol;
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
  )
    openEnds++;

  r = startRow - dRow;
  c = startCol - dCol;
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  )
    openEnds++;

  let score = 0;
  if (consecutiveCount >= 4) score = 10000;
  else if (consecutiveCount === 3) score = openEnds > 0 ? 500 : 100;
  else if (consecutiveCount === 2) score = openEnds > 1 ? 50 : 20;
  else score = 5;

  return player === PLAYER.BLUE ? score : -score;
}

function getConnectivityBonusAdvanced(board, blockedCells, row, col, player) {
  let connectivityScore = 0;
  for (let [dRow, dCol] of DIRECTIONS) {
    let potentialLength = 1;
    for (let dir of [-1, 1]) {
      let r = row + dRow * dir,
        c = col + dCol * dir,
        steps = 0;
      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        steps < 3 &&
        !blockedCells.has(`${r}-${c}`) &&
        (board[r][c] === 0 || board[r][c] === player)
      ) {
        if (board[r][c] === player) potentialLength++;
        r += dRow * dir;
        c += dCol * dir;
        steps++;
      }
    }
    if (potentialLength >= 3) connectivityScore += potentialLength * 2;
  }
  return connectivityScore;
}

function getPositionalScoreAdvanced(row, col, player) {
  let score = 0;
  const centerDistance = Math.abs(col - COLS / 2);
  score += Math.max(0, 15 - centerDistance * 2);
  score += (ROWS - row) * 2;
  return player === PLAYER.BLUE ? score : -score * 0.9;
}

function evaluateBoardAdvanced(board, blockedCells) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0 && !blockedCells.has(`${r}-${c}`)) {
        let total = 0;
        for (let [dr, dc] of DIRECTIONS) {
          total += evaluateLineAdvanced(
            board,
            blockedCells,
            r,
            c,
            dr,
            dc,
            board[r][c]
          );
        }
        total += getPositionalScoreAdvanced(r, c, board[r][c]);
        total += getConnectivityBonusAdvanced(
          board,
          blockedCells,
          r,
          c,
          board[r][c]
        );
        score += total;
      }
    }
  }
  return score;
}

function evaluateLine(
  board,
  blockedCells,
  startRow,
  startCol,
  dRow,
  dCol,
  player
) {
  const prevRow = startRow - dRow,
    prevCol = startCol - dCol;
  if (
    prevRow >= 0 &&
    prevRow < ROWS &&
    prevCol >= 0 &&
    prevCol < COLS &&
    board[prevRow][prevCol] === player &&
    !blockedCells.has(`${prevRow}-${prevCol}`)
  )
    return 0;

  let consecutive = 1,
    openEnds = 0;
  let r = startRow + dRow,
    c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === player &&
    !blockedCells.has(`${r}-${c}`) &&
    consecutive < 4
  ) {
    consecutive++;
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
  )
    openEnds++;

  r = startRow - dRow;
  c = startCol - dCol;
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blockedCells.has(`${r}-${c}`)
  )
    openEnds++;

  let score = 0;
  if (consecutive >= 4) score = 1000;
  else if (consecutive === 3) score = openEnds > 0 ? 60 : 30;
  else if (consecutive === 2) score = openEnds > 1 ? 15 : 8;
  else score = 2;

  return player === PLAYER.BLUE ? score : -score * 0.9;
}

function getPositionalScore(row, col, player) {
  let score = 0;
  const centerDistance = Math.abs(col - COLS / 2);
  score += Math.max(0, 8 - centerDistance);
  score += (ROWS - row) * 0.5;
  return player === PLAYER.BLUE ? score : -score * 0.8;
}

function getConnectivityBonus(board, blockedCells, row, col, player) {
  let s = 0;
  for (let [dr, dc] of DIRECTIONS) {
    let potential = 1;
    for (let dir of [-1, 1]) {
      let r = row + dr * dir,
        c = col + dc * dir,
        steps = 0;
      while (
        r >= 0 &&
        r < ROWS &&
        c >= 0 &&
        c < COLS &&
        steps < 3 &&
        !blockedCells.has(`${r}-${c}`) &&
        (board[r][c] === 0 || board[r][c] === player)
      ) {
        if (board[r][c] === player) potential++;
        r += dr * dir;
        c += dc * dir;
        steps++;
      }
    }
    if (potential >= 3) s += potential;
  }
  return s;
}

function evaluateBoard(board, blockedCells) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0 && !blockedCells.has(`${r}-${c}`)) {
        let total = 0;
        for (let [dr, dc] of DIRECTIONS)
          total += evaluateLine(board, blockedCells, r, c, dr, dc, board[r][c]);
        total += getPositionalScore(r, c, board[r][c]);
        total +=
          getConnectivityBonus(board, blockedCells, r, c, board[r][c]) * 0.3;
        score += total;
      }
    }
  }
  return score;
}

function isTerminalNode(board, blockedCells) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0 && !blockedCells.has(`${r}-${c}`)) {
        if (checkForWinSimulation(board, blockedCells, r, c, board[r][c]))
          return true;
      }
    }
  }
  for (let c = 0; c < COLS; c++)
    if (canDropInColumn(board, blockedCells, c)) return false;
  return true;
}

/* ----------------- Minimax variants ----------------- */

function minimaxAdvanced(
  board,
  blockedCells,
  depth,
  isMaximizing,
  alpha,
  beta
) {
  if (depth === 0 || isTerminalNode(board, blockedCells)) {
    return evaluateBoardAdvanced(board, blockedCells);
  }
  const candidateMoves = getCandidateMovesOrdered(board, blockedCells);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let col of candidateMoves) {
      if (!canDropInColumn(board, blockedCells, col)) continue;
      const row = getDropRow(board, blockedCells, col);
      board[row][col] = PLAYER.BLUE;
      const val = minimaxAdvanced(
        board,
        blockedCells,
        depth - 1,
        false,
        alpha,
        beta
      );
      board[row][col] = 0;
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let col of candidateMoves) {
      if (!canDropInColumn(board, blockedCells, col)) continue;
      const row = getDropRow(board, blockedCells, col);
      board[row][col] = PLAYER.RED;
      const val = minimaxAdvanced(
        board,
        blockedCells,
        depth - 1,
        true,
        alpha,
        beta
      );
      board[row][col] = 0;
      minEval = Math.min(minEval, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function minimax(board, blockedCells, depth, isMaximizing, alpha, beta) {
  if (depth === 0 || isTerminalNode(board, blockedCells)) {
    return evaluateBoard(board, blockedCells);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (let col = 0; col < COLS; col++) {
      if (!canDropInColumn(board, blockedCells, col)) continue;
      const row = getDropRow(board, blockedCells, col);
      board[row][col] = PLAYER.BLUE;
      const val = minimax(board, blockedCells, depth - 1, false, alpha, beta);
      board[row][col] = 0;
      maxEval = Math.max(maxEval, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let col = 0; col < COLS; col++) {
      if (!canDropInColumn(board, blockedCells, col)) continue;
      const row = getDropRow(board, blockedCells, col);
      board[row][col] = PLAYER.RED;
      const val = minimax(board, blockedCells, depth - 1, true, alpha, beta);
      board[row][col] = 0;
      minEval = Math.min(minEval, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/* ----------------- Difficulty entry points ----------------- */

function getBestMoveBeginner(grid, blockedCells) {
  // Immediate win
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const row = getDropRow(grid, blockedCells, col);
    grid[row][col] = PLAYER.BLUE;
    if (checkForWinSimulation(grid, blockedCells, row, col, PLAYER.BLUE)) {
      grid[row][col] = 0;
      return col;
    }
    grid[row][col] = 0;
  }

  // Sometimes block immediate threat
  if (Math.random() < AI.BEGINNER_BLOCK_PROB) {
    const blockCol = findImmediateThreat(grid, blockedCells);
    if (blockCol !== -1) return blockCol;
  }

  // Random w/ center weight
  const bucket = [];
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const dist = Math.abs(col - COLS / 2);
    const weight = Math.max(1, 4 - Math.floor(dist / 3));
    for (let i = 0; i < weight; i++) bucket.push(col);
  }
  if (bucket.length === 0) return -1;
  return bucket[Math.floor(Math.random() * bucket.length)];
}

function getBestMoveMedium(grid, blockedCells) {
  const depth = AI.MEDIUM_DEPTH;

  const openTwoBlock = findOpenTwoThreatBlock(grid, blockedCells);
  if (openTwoBlock !== -1 && Math.random() < AI.MEDIUM_TWO_BLOCK_PROB)
    return openTwoBlock;

  const blockingMove = findImmediateThreat(grid, blockedCells);
  if (blockingMove !== -1) return blockingMove;

  const moves = [];
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const row = getDropRow(grid, blockedCells, col);

    grid[row][col] = PLAYER.BLUE;
    let score = minimax(
      grid,
      blockedCells,
      depth - 1,
      false,
      -Infinity,
      Infinity
    );
    const centerBonus = Math.max(0, 5 - Math.abs(col - COLS / 2)) * 2;
    score += centerBonus;
    grid[row][col] = 0;

    moves.push({ col, score });
  }

  if (moves.length === 0) return -1;
  moves.sort((a, b) => b.score - a.score);

  const r = Math.random();
  if (r < 0.05) {
    const bottomQuarter = moves.slice(Math.floor(moves.length * 0.75));
    if (bottomQuarter.length > 0)
      return bottomQuarter[Math.floor(Math.random() * bottomQuarter.length)]
        .col;
    const decent = moves.slice(1, Math.min(5, moves.length));
    return decent[Math.floor(Math.random() * Math.max(1, decent.length))].col;
  } else if (r < 0.45) {
    const decent = moves.slice(1, Math.min(5, moves.length));
    if (decent.length > 0)
      return decent[Math.floor(Math.random() * decent.length)].col;
    return moves[0].col;
  } else {
    return moves[0].col;
  }
}

function getBestMoveAdvanced(grid, blockedCells) {
  const depth = AI.ADVANCED_DEPTH;

  // Immediate win
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const row = getDropRow(grid, blockedCells, col);
    grid[row][col] = PLAYER.BLUE;
    if (checkForWinSimulation(grid, blockedCells, row, col, PLAYER.BLUE)) {
      grid[row][col] = 0;
      return col;
    }
    grid[row][col] = 0;
  }

  // Block immediate threat
  const blockingMove = findImmediateThreat(grid, blockedCells);
  if (blockingMove !== -1) return blockingMove;

  // Sometimes block open-two threats
  const openTwoBlock = findOpenTwoThreatBlock(grid, blockedCells);
  if (openTwoBlock !== -1 && Math.random() < AI.ADVANCED_TWO_BLOCK_PROB)
    return openTwoBlock;

  const candidates = getCandidateMovesOrdered(grid, blockedCells);
  const moves = [];

  for (let col of candidates) {
    if (!canDropInColumn(grid, blockedCells, col)) continue;
    const row = getDropRow(grid, blockedCells, col);

    grid[row][col] = PLAYER.BLUE;
    let score = minimaxAdvanced(
      grid,
      blockedCells,
      depth - 1,
      false,
      -Infinity,
      Infinity
    );
    const centerBonus = Math.max(0, 8 - Math.abs(col - COLS / 2)) * 3;
    score += centerBonus;
    grid[row][col] = 0;

    moves.push({ col, score });
  }

  if (moves.length === 0) return -1;
  moves.sort((a, b) => b.score - a.score);

  const r = Math.random();
  if (r < 0.85) return moves[0].col;
  if (r < 0.97) return moves.length > 1 ? moves[1].col : moves[0].col;
  return moves.length > 2 ? moves[2].col : moves[0].col;
}
