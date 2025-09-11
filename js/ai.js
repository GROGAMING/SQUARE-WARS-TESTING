// File: src/ai.js
// Square Wars — Connect-4 variant AI (30x20), rules-correct search with section-closing.
// This version is optimized for speed and *avoids blunders* at Impossible by
// adding root-level fork prevention (doesn't hand the opponent easy closes).
//
// Perf features:
// - Uint8Array blocked mask, incremental Zobrist hashing.
// - Iterative deepening + aspiration windows + LMR + killer/history ordering.
// - Time & node budgets.
// Strength features:
// - Root blunder filter: blocks immediate RED close and RED double-threat forks.
// - Stronger pattern/pressure eval, closing-aware simulation.

import { ROWS, COLS, PLAYER, DIRECTIONS, AI as AI_IN } from "./constants.js";

/* -------------------------------------------------------------------------- */
/* Public API
/* -------------------------------------------------------------------------- */

export function chooseComputerMove({ grid, blockedCells, aiDifficulty }) {
  const AI = withDefaults(AI_IN);
  const { blockedMask, hashBase } = materializeState(grid, blockedCells);

  if (!aiDifficulty || aiDifficulty === "medium")
    return getBestMoveMedium(grid, blockedMask, hashBase, AI);
  if (aiDifficulty === "beginner")
    return getBestMoveBeginner(grid, blockedMask, hashBase, AI);
  if (aiDifficulty === "advanced")
    return getBestMoveAdvanced(grid, blockedMask, hashBase, AI);
  if (aiDifficulty === "impossible")
    return getBestMoveImpossible(grid, blockedMask, hashBase, AI);
  return getBestMoveMedium(grid, blockedMask, hashBase, AI);
}

/* -------------------------------------------------------------------------- */
/* Config & helpers
/* -------------------------------------------------------------------------- */

function withDefaults(AI) {
  const out = {
    BEGINNER_BLOCK_PROB: 0.5,
    MEDIUM_DEPTH: 3,
    MEDIUM_TWO_BLOCK_PROB: 0.5,
    ADVANCED_DEPTH: 4,
    ADVANCED_TWO_BLOCK_PROB: 0.75,
    IMPOSSIBLE_DEPTH: 6,
    // Perf knobs
    ADVANCED_NODE_BUDGET: 90_000,
    IMPOSSIBLE_NODE_BUDGET: 140_000,
    ADVANCED_MS: 18,
    IMPOSSIBLE_MS: 32,
    CAND_LIMIT_MED: 8,
    CAND_LIMIT_ADV: 8,
    CAND_LIMIT_IMP: 9,
  };
  if (AI) Object.assign(out, AI);
  return out;
}

const now = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
const idxOf = (r, c) => r * COLS + c;
const rOf = (idx) => (idx / COLS) | 0;
const cOf = (idx) => idx % COLS;

function materializeState(grid, blockedCells) {
  const blockedMask = new Uint8Array(ROWS * COLS);
  if (blockedCells) {
    if (blockedCells instanceof Set) {
      for (const k of blockedCells) {
        const [r, c] = k.split("-");
        const ri = r | 0,
          ci = c | 0;
        if (ri >= 0 && ri < ROWS && ci >= 0 && ci < COLS)
          blockedMask[idxOf(ri, ci)] = 1;
      }
    } else if (Array.isArray(blockedCells)) {
      for (const k of blockedCells) {
        const [r, c] = String(k).split("-");
        const ri = r | 0,
          ci = c | 0;
        if (ri >= 0 && ri < ROWS && ci >= 0 && ci < COLS)
          blockedMask[idxOf(ri, ci)] = 1;
      }
    }
  }
  const hashBase = computeHashBase(grid, blockedMask);
  return { blockedMask, hashBase };
}

/* -------------------------------------------------------------------------- */
/* Core rules (gravity + closing sections)
/* -------------------------------------------------------------------------- */

function canDropInColumn(grid, blocked, col) {
  for (let r = ROWS - 1; r >= 0; r--)
    if (grid[r][col] === 0 && !blocked[idxOf(r, col)]) return true;
  return false;
}
function getDropRow(grid, blocked, col) {
  for (let r = ROWS - 1; r >= 0; r--)
    if (grid[r][col] === 0 && !blocked[idxOf(r, col)]) return r;
  return -1;
}
function isPlayableCell(grid, blocked, r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (blocked[idxOf(r, c)]) return false;
  if (grid[r][c] !== 0) return false;
  return getDropRow(grid, blocked, c) === r;
}

function getLineForSim(grid, blocked, startRow, startCol, dRow, dCol, player) {
  const line = [{ row: startRow, col: startCol }];
  let r = startRow + dRow,
    c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    grid[r][c] === player &&
    !blocked[idxOf(r, c)]
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
    !blocked[idxOf(r, c)]
  ) {
    line.unshift({ row: r, col: c });
    r -= dRow;
    c -= dCol;
  }
  return line;
}
function checkForWinSimulation(grid, blocked, row, col, player) {
  for (let [dr, dc] of DIRECTIONS)
    if (getLineForSim(grid, blocked, row, col, dr, dc, player).length >= 4)
      return true;
  return false;
}
function collectNewlyClosedIndices(grid, blocked, row, col, player) {
  const out = [];
  const seen = new Set();
  for (let [dr, dc] of DIRECTIONS) {
    const line = getLineForSim(grid, blocked, row, col, dr, dc, player);
    if (line.length >= 4)
      for (const { row: r, col: c } of line) {
        const id = idxOf(r, c);
        if (!blocked[id] && !seen.has(id)) {
          out.push(id);
          seen.add(id);
        }
      }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Zobrist hashing (incremental)
/* -------------------------------------------------------------------------- */

const Z_PIECE = (() => {
  const arr = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    arr[r] = new Array(COLS);
    for (let c = 0; c < COLS; c++) arr[r][c] = [rand32(), rand32()];
  }
  return arr;
})();
const Z_BLOCK = (() => {
  const arr = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    arr[r] = new Array(COLS);
    for (let c = 0; c < COLS; c++) arr[r][c] = rand32();
  }
  return arr;
})();
const Z_TURN = rand32();
function rand32() {
  let x = (Math.random() * 0xffffffff) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
function computeHashBase(board, blocked) {
  let h = 0 >>> 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v === PLAYER.RED) h ^= Z_PIECE[r][c][0];
      else if (v === PLAYER.BLUE) h ^= Z_PIECE[r][c][1];
      if (blocked[idxOf(r, c)]) h ^= Z_BLOCK[r][c];
    }
  }
  return h >>> 0;
}

/* -------------------------------------------------------------------------- */
/* Move application with incremental hash
/* -------------------------------------------------------------------------- */

function applyMove(grid, blocked, col, player, hash, toggleTurn) {
  const row = getDropRow(grid, blocked, col);
  if (row === -1) return null;
  grid[row][col] = player;
  let newHash = hash ^ Z_PIECE[row][col][player === PLAYER.RED ? 0 : 1];
  if (toggleTurn) newHash ^= Z_TURN;
  const newlyClosed = collectNewlyClosedIndices(
    grid,
    blocked,
    row,
    col,
    player
  );
  for (const id of newlyClosed) {
    blocked[id] = 1;
    newHash ^= Z_BLOCK[rOf(id)][cOf(id)];
  }
  return { row, col, player, newlyClosed, hash: newHash };
}
function undoMove(grid, blocked, move, prevHash, toggleTurn) {
  if (!move) return prevHash;
  const { row, col, newlyClosed } = move;
  for (const id of newlyClosed) blocked[id] = 0;
  grid[row][col] = 0;
  return prevHash;
}

/* -------------------------------------------------------------------------- */
/* Candidate generation & ordering
/* -------------------------------------------------------------------------- */

function getCandidateMovesOrdered(
  grid,
  blocked,
  limit = 12,
  pvMove = -1,
  history = null
) {
  const candidates = [];
  const center = Math.floor(COLS / 2);
  if (pvMove >= 0 && canDropInColumn(grid, blocked, pvMove))
    candidates.push(pvMove);
  for (
    let offset = 0;
    offset <= center && candidates.length < limit;
    offset++
  ) {
    if (offset === 0) {
      if (canDropInColumn(grid, blocked, center) && center !== pvMove)
        candidates.push(center);
    } else {
      const L = center - offset,
        R = center + offset;
      if (L >= 0 && canDropInColumn(grid, blocked, L) && L !== pvMove)
        candidates.push(L);
      if (candidates.length >= limit) break;
      if (R < COLS && canDropInColumn(grid, blocked, R) && R !== pvMove)
        candidates.push(R);
    }
  }
  if (history) candidates.sort((a, b) => (history[b] | 0) - (history[a] | 0));
  return candidates;
}

function effectiveDepth(baseDepth, grid, blocked, hardMax = baseDepth) {
  let filled = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] !== 0 && !blocked[idxOf(r, c)]) filled++;
  if (filled < 20) return Math.max(2, baseDepth - 1);
  if (filled > 280) return Math.min(hardMax, baseDepth + 1);
  return baseDepth;
}

/* -------------------------------------------------------------------------- */
/* Threat utilities (now with fork detection for RED)
/* -------------------------------------------------------------------------- */

function findImmediateThreat(grid, blocked) {
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blocked, col)) continue;
    const row = getDropRow(grid, blocked, col);
    grid[row][col] = PLAYER.RED;
    const willClose = checkForWinSimulation(
      grid,
      blocked,
      row,
      col,
      PLAYER.RED
    );
    grid[row][col] = 0;
    if (willClose) return col;
  }
  return -1;
}

function countImmediateClosesFor(board, blocked, player) {
  let count = 0;
  const cols = [];
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(board, blocked, col)) continue;
    const row = getDropRow(board, blocked, col);
    board[row][col] = player;
    const close = checkForWinSimulation(board, blocked, row, col, player);
    board[row][col] = 0;
    if (close) {
      count++;
      cols.push(col);
    }
  }
  return { count, cols };
}

function findOpenTwoThreatBlock(grid, blocked) {
  const player = PLAYER.RED;
  const candidates = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== player || blocked[idxOf(r, c)]) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const r2 = r + dr,
          c2 = c + dc;
        if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) continue;
        if (grid[r][c] !== player || grid[r2][c2] !== player) continue;
        const lr = r - dr,
          lc = c - dc,
          rr = r2 + dr,
          rc = c2 + dc;
        if (isPlayableCell(grid, blocked, lr, lc)) candidates.push(lc);
        if (isPlayableCell(grid, blocked, rr, rc)) candidates.push(rc);
      }
    }
  }
  if (!candidates.length) return -1;
  const center = COLS / 2;
  candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  return candidates[0];
}

function isHandingImmediateClose(grid, blocked, colAfterOurMove, hashBase = 0) {
  const m = applyMove(
    grid,
    blocked,
    colAfterOurMove,
    PLAYER.BLUE,
    hashBase,
    false
  );
  if (!m) return false;
  const { count } = countImmediateClosesFor(grid, blocked, PLAYER.RED);
  undoMove(grid, blocked, m, hashBase, false);
  return count > 0;
}

// NEW: does our move allow RED to create a double immediate threat on their *next* move?
function createsOpponentForkAfterOurMove(
  grid,
  blocked,
  colAfterOurMove,
  hashBase = 0
) {
  const m = applyMove(
    grid,
    blocked,
    colAfterOurMove,
    PLAYER.BLUE,
    hashBase,
    false
  );
  if (!m) return false;

  // If RED already has an immediate, it's a blunder (covered elsewhere)
  const imm = countImmediateClosesFor(grid, blocked, PLAYER.RED);
  if (imm.count > 0) {
    undoMove(grid, blocked, m, hashBase, false);
    return true;
  }

  // Look for an opponent quiet move that yields ≥2 immediate closes next turn.
  for (let opCol = 0; opCol < COLS; opCol++) {
    if (!canDropInColumn(grid, blocked, opCol)) continue;
    const r = getDropRow(grid, blocked, opCol);
    // Skip opponent moves that already close; those were caught earlier, still treat as losing.
    grid[r][opCol] = PLAYER.RED;
    const closeNow = checkForWinSimulation(grid, blocked, r, opCol, PLAYER.RED);
    grid[r][opCol] = 0;
    if (closeNow) {
      undoMove(grid, blocked, m, hashBase, false);
      return true;
    }

    const opM = applyMove(grid, blocked, opCol, PLAYER.RED, hashBase, false);
    if (!opM) continue;
    const next = countImmediateClosesFor(grid, blocked, PLAYER.RED);
    undoMove(grid, blocked, opM, hashBase, false);
    if (next.count >= 2) {
      undoMove(grid, blocked, m, hashBase, false);
      return true;
    }
  }

  undoMove(grid, blocked, m, hashBase, false);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Evaluation (fast + strong)
/* -------------------------------------------------------------------------- */

function evaluateBoardSimple(board, blocked) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0 && !blocked[idxOf(r, c)]) {
        let total = 0;
        for (let [dr, dc] of DIRECTIONS)
          total += evaluateLineSimple(
            board,
            blocked,
            r,
            c,
            dr,
            dc,
            board[r][c]
          );
        total += getPositionalScoreSimple(r, c, board[r][c]);
        total +=
          getConnectivityBonusSimple(board, blocked, r, c, board[r][c]) * 0.3;
        score += total;
      }
    }
  }
  return score;
}
function evaluateLineSimple(
  board,
  blocked,
  startRow,
  startCol,
  dRow,
  dCol,
  player
) {
  const pr = startRow - dRow,
    pc = startCol - dCol;
  if (
    pr >= 0 &&
    pr < ROWS &&
    pc >= 0 &&
    pc < COLS &&
    board[pr][pc] === player &&
    !blocked[idxOf(pr, pc)]
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
    !blocked[idxOf(r, c)] &&
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
    !blocked[idxOf(r, c)]
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
    !blocked[idxOf(r, c)]
  )
    openEnds++;
  let s = 0;
  if (consecutive >= 4) s = 1000;
  else if (consecutive === 3) s = openEnds > 0 ? 60 : 30;
  else if (consecutive === 2) s = openEnds > 1 ? 15 : 8;
  else s = 2;
  return player === PLAYER.BLUE ? s : -s * 0.9;
}
function getPositionalScoreSimple(row, col, player) {
  let s = 0;
  const centerDistance = Math.abs(col - COLS / 2);
  s += Math.max(0, 8 - centerDistance);
  s += (ROWS - row) * 0.5;
  return player === PLAYER.BLUE ? s : -s * 0.8;
}
function getConnectivityBonusSimple(board, blocked, row, col, player) {
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
        !blocked[idxOf(r, c)] &&
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

function evaluateBoardAdvanced(board, blocked) {
  let score = 0,
    mobB = 0,
    mobR = 0,
    closeB = 0,
    closeR = 0;
  for (let c = 0; c < COLS; c++) {
    if (!canDropInColumn(board, blocked, c)) continue;
    const r = getDropRow(board, blocked, c);
    board[r][c] = PLAYER.BLUE;
    const b = checkForWinSimulation(board, blocked, r, c, PLAYER.BLUE);
    board[r][c] = 0;
    if (b) closeB++;
    board[r][c] = PLAYER.RED;
    const rc = checkForWinSimulation(board, blocked, r, c, PLAYER.RED);
    board[r][c] = 0;
    if (rc) closeR++;
    mobB++;
    mobR++;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0 && !blocked[idxOf(r, c)]) {
        let total = 0;
        for (let [dr, dc] of DIRECTIONS)
          total += evalLineAdvanced(board, blocked, r, c, dr, dc, board[r][c]);
        total += getPositionalScoreAdvanced(r, c, board[r][c]);
        total += getConnectivityBonusAdvanced(
          board,
          blocked,
          r,
          c,
          board[r][c]
        );
        score += total;
      }
    }
  }
  score += closeB * 700;
  score -= closeR * 800;
  score += (mobB - mobR) * 2;
  return score;
}
function evalLineAdvanced(
  board,
  blocked,
  startRow,
  startCol,
  dRow,
  dCol,
  player
) {
  const pr = startRow - dRow,
    pc = startCol - dCol;
  if (
    pr >= 0 &&
    pr < ROWS &&
    pc >= 0 &&
    pc < COLS &&
    board[pr][pc] === player &&
    !blocked[idxOf(pr, pc)]
  )
    return 0;
  let cnt = 1,
    open = 0;
  let r = startRow + dRow,
    c = startCol + dCol;
  while (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === player &&
    !blocked[idxOf(r, c)] &&
    cnt < 5
  ) {
    cnt++;
    r += dRow;
    c += dCol;
  }
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blocked[idxOf(r, c)]
  )
    open++;
  r = startRow - dRow;
  c = startCol - dCol;
  if (
    r >= 0 &&
    r < ROWS &&
    c >= 0 &&
    c < COLS &&
    board[r][c] === 0 &&
    !blocked[idxOf(r, c)]
  )
    open++;
  let s = 0;
  if (cnt >= 4) s = 4500;
  else if (cnt === 3) s = open > 0 ? 420 : 110;
  else if (cnt === 2) s = open > 1 ? 55 : 22;
  else s = 5;
  return player === PLAYER.BLUE ? s : -s;
}
function getConnectivityBonusAdvanced(board, blocked, row, col, player) {
  let sc = 0;
  for (let [dr, dc] of DIRECTIONS) {
    let pot = 1;
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
        !blocked[idxOf(r, c)] &&
        (board[r][c] === 0 || board[r][c] === player)
      ) {
        if (board[r][c] === player) pot++;
        r += dr * dir;
        c += dc * dir;
        steps++;
      }
    }
    if (pot >= 3) sc += pot * 2;
  }
  return sc;
}
function getPositionalScoreAdvanced(row, col, player) {
  let s = 0;
  const centerDistance = Math.abs(col - COLS / 2);
  s += Math.max(0, 15 - centerDistance * 2);
  s += (ROWS - row) * 2;
  return player === PLAYER.BLUE ? s : -s * 0.9;
}

/* -------------------------------------------------------------------------- */
/* Transposition table & search
/* -------------------------------------------------------------------------- */

const TT_FLAG = { EXACT: 0, LOWER: 1, UPPER: 2 };
const globalTT = new Map();
function probeTT(hash, depth, alpha, beta) {
  const e = globalTT.get(hash);
  if (!e || e.depth < depth) return null;
  if (e.flag === TT_FLAG.EXACT) return e.value;
  if (e.flag === TT_FLAG.LOWER && e.value > alpha) alpha = e.value;
  else if (e.flag === TT_FLAG.UPPER && e.value < beta) beta = e.value;
  return alpha >= beta ? e.value : null;
}
function storeTT(hash, depth, value, flag, bestMove) {
  globalTT.set(hash, { depth, value, flag, bestMove });
}
function noMovesRemain(board, blocked) {
  for (let c = 0; c < COLS; c++)
    if (canDropInColumn(board, blocked, c)) return false;
  return true;
}

function minimaxTT({
  board,
  blocked,
  depth,
  isMax,
  alpha,
  beta,
  evalFn,
  nodeBudget,
  timeBudget,
  startTime,
  hash,
  history,
  killers,
  ply = 0,
  pvMove = -1,
}) {
  if (nodeBudget.count-- <= 0) return evalFn(board, blocked);
  if (timeBudget > 0 && now() - startTime > timeBudget)
    return evalFn(board, blocked);

  if (depth === 0) {
    let canClose = false;
    for (let c = 0; c < COLS && !canClose; c++) {
      if (!canDropInColumn(board, blocked, c)) continue;
      const r = getDropRow(board, blocked, c);
      board[r][c] = isMax ? PLAYER.BLUE : PLAYER.RED;
      const win = checkForWinSimulation(
        board,
        blocked,
        r,
        c,
        isMax ? PLAYER.BLUE : PLAYER.RED
      );
      board[r][c] = 0;
      if (win) canClose = true;
    }
    if (!canClose) return evalFn(board, blocked);
  }
  if (noMovesRemain(board, blocked)) return evalFn(board, blocked);

  const ttVal = probeTT(hash, depth, alpha, beta);
  if (ttVal !== null) return ttVal;

  let bestVal = isMax ? -Infinity : Infinity;
  let bestMove = -1;
  let flag = TT_FLAG.UPPER;
  const order = getCandidateMovesOrdered(
    board,
    blocked,
    12,
    globalTT.get(hash)?.bestMove ?? pvMove,
    history
  );
  if (killers[ply])
    for (const km of killers[ply])
      if (km >= 0 && canDropInColumn(board, blocked, km) && !order.includes(km))
        order.unshift(km);

  const futility = depth <= 2 ? evalFn(board, blocked) - 200 : null;
  let moveIndex = 0;
  for (const col of order) {
    if (futility !== null && isMax && bestVal >= beta) break;

    let reduced = 0;
    const r = getDropRow(board, blocked, col);
    const quiet = (() => {
      board[r][col] = isMax ? PLAYER.BLUE : PLAYER.RED;
      const th = checkForWinSimulation(board, blocked, r, col, board[r][col]);
      board[r][col] = 0;
      return !th;
    })();
    if (depth >= 4 && moveIndex >= 2 && quiet) reduced = 1;

    const prevHash = hash;
    const move = applyMove(
      board,
      blocked,
      col,
      isMax ? PLAYER.BLUE : PLAYER.RED,
      hash ^ Z_TURN,
      true
    );
    if (!move) {
      moveIndex++;
      continue;
    }

    let val = minimaxTT({
      board,
      blocked,
      depth: depth - 1 - reduced,
      isMax: !isMax,
      alpha,
      beta,
      evalFn,
      nodeBudget,
      timeBudget,
      startTime,
      hash: move.hash,
      history,
      killers,
      ply: ply + 1,
      pvMove: bestMove,
    });
    if (reduced && isMax && val > alpha) {
      val = minimaxTT({
        board,
        blocked,
        depth: depth - 1,
        isMax: !isMax,
        alpha,
        beta,
        evalFn,
        nodeBudget,
        timeBudget,
        startTime,
        hash: move.hash,
        history,
        killers,
        ply: ply + 1,
        pvMove: bestMove,
      });
    }

    hash = undoMove(board, blocked, move, prevHash, true);

    if (isMax) {
      if (val > bestVal) {
        bestVal = val;
        bestMove = col;
      }
      if (bestVal > alpha) {
        alpha = bestVal;
        flag = TT_FLAG.EXACT;
      }
      if (alpha >= beta) {
        if (!killers[ply]) killers[ply] = [-1, -1];
        if (killers[ply][0] !== col) killers[ply] = [col, killers[ply][0]];
        history[col] = (history[col] | 0) + depth * depth;
        break;
      }
    } else {
      if (val < bestVal) {
        bestVal = val;
        bestMove = col;
      }
      if (bestVal < beta) {
        beta = bestVal;
        flag = TT_FLAG.EXACT;
      }
      if (alpha >= beta) {
        if (!killers[ply]) killers[ply] = [-1, -1];
        if (killers[ply][0] !== col) killers[ply] = [col, killers[ply][0]];
        history[col] = (history[col] | 0) + depth * depth;
        break;
      }
    }

    moveIndex++;
  }

  if (bestMove !== -1) storeTT(hash, depth, bestVal, flag, bestMove);
  return bestVal;
}

/* -------------------------------------------------------------------------- */
/* Difficulty entry points
/* -------------------------------------------------------------------------- */

function getBestMoveBeginner(grid, blocked, hashBase, AI) {
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blocked, col)) continue;
    const row = getDropRow(grid, blocked, col);
    grid[row][col] = PLAYER.BLUE;
    const close = checkForWinSimulation(grid, blocked, row, col, PLAYER.BLUE);
    grid[row][col] = 0;
    if (close) return col;
  }
  if (Math.random() < AI.BEGINNER_BLOCK_PROB) {
    const blockCol = findImmediateThreat(grid, blocked);
    if (blockCol !== -1) return blockCol;
  }
  const bucket = [];
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blocked, col)) continue;
    if (isHandingImmediateClose(grid, blocked, col)) continue;
    const dist = Math.abs(col - COLS / 2);
    const w = Math.max(1, 4 - Math.floor(dist / 3));
    for (let i = 0; i < w; i++) bucket.push(col);
  }
  if (!bucket.length)
    for (let col = 0; col < COLS; col++)
      if (canDropInColumn(grid, blocked, col)) bucket.push(col);
  return bucket.length ? bucket[(Math.random() * bucket.length) | 0] : -1;
}

function getBestMoveMedium(grid, blocked, hashBase, AI) {
  const depth = effectiveDepth(AI.MEDIUM_DEPTH, grid, blocked, AI.MEDIUM_DEPTH);
  const openTwoBlock = findOpenTwoThreatBlock(grid, blocked);
  if (openTwoBlock !== -1 && Math.random() < AI.MEDIUM_TWO_BLOCK_PROB)
    return openTwoBlock;
  const blockingMove = findImmediateThreat(grid, blocked);
  if (blockingMove !== -1) return blockingMove;

  const moves = [];
  const candidates = getCandidateMovesOrdered(grid, blocked, AI.CAND_LIMIT_MED);
  const nodeBudget = { count: 45_000 };
  const timeBudget = AI.ADVANCED_MS * 0.6;
  const start = now();
  const history = Object.create(null);
  const killers = [];

  for (let col of candidates) {
    if (isHandingImmediateClose(grid, blocked, col, hashBase)) continue;
    const move = applyMove(
      grid,
      blocked,
      col,
      PLAYER.BLUE,
      hashBase ^ Z_TURN,
      true
    );
    if (!move) continue;
    const score = minimaxTT({
      board: grid,
      blocked,
      depth: depth - 1,
      isMax: false,
      alpha: -Infinity,
      beta: Infinity,
      evalFn: evaluateBoardSimple,
      nodeBudget,
      timeBudget,
      startTime: start,
      hash: move.hash,
      history,
      killers,
    });
    undoMove(grid, blocked, move, hashBase, true);
    const centerBonus = Math.max(0, 5 - Math.abs(col - COLS / 2)) * 2;
    moves.push({ col, score: score + centerBonus });
  }
  if (!moves.length) return -1;
  moves.sort((a, b) => b.score - a.score);
  return moves[0].col;
}

function getBestMoveAdvanced(grid, blocked, hashBase, AI) {
  const base = AI.ADVANCED_DEPTH;
  const depth = effectiveDepth(base, grid, blocked, base);
  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blocked, col)) continue;
    const row = getDropRow(grid, blocked, col);
    grid[row][col] = PLAYER.BLUE;
    if (checkForWinSimulation(grid, blocked, row, col, PLAYER.BLUE)) {
      grid[row][col] = 0;
      return col;
    }
    grid[row][col] = 0;
  }
  const blockingMove = findImmediateThreat(grid, blocked);
  if (blockingMove !== -1) return blockingMove;
  const openTwoBlock = findOpenTwoThreatBlock(grid, blocked);
  if (openTwoBlock !== -1 && Math.random() < AI.ADVANCED_TWO_BLOCK_PROB)
    return openTwoBlock;

  const candidates = getCandidateMovesOrdered(grid, blocked, AI.CAND_LIMIT_ADV);
  const history = Object.create(null);
  const killers = [];
  const moves = [];
  const nodeBudget = { count: AI.ADVANCED_NODE_BUDGET };
  const start = now();
  const timeBudget = AI.ADVANCED_MS;

  for (let col of candidates) {
    if (isHandingImmediateClose(grid, blocked, col, hashBase)) continue;
    const move = applyMove(
      grid,
      blocked,
      col,
      PLAYER.BLUE,
      hashBase ^ Z_TURN,
      true
    );
    if (!move) continue;
    const score = minimaxTT({
      board: grid,
      blocked,
      depth: depth - 1,
      isMax: false,
      alpha: -Infinity,
      beta: Infinity,
      evalFn: evaluateBoardAdvanced,
      nodeBudget,
      timeBudget,
      startTime: start,
      hash: move.hash,
      history,
      killers,
    });
    undoMove(grid, blocked, move, hashBase, true);
    const centerBonus = Math.max(0, 8 - Math.abs(col - COLS / 2)) * 3;
    moves.push({ col, score: score + centerBonus });
  }
  if (!moves.length) return -1;
  moves.sort((a, b) => b.score - a.score);
  return moves[0].col;
}

function getBestMoveImpossible(grid, blocked, hashBase, AI) {
  const base = AI.IMPOSSIBLE_DEPTH;
  const cap = effectiveDepth(base, grid, blocked, base);

  for (let col = 0; col < COLS; col++) {
    if (!canDropInColumn(grid, blocked, col)) continue;
    const row = getDropRow(grid, blocked, col);
    grid[row][col] = PLAYER.BLUE;
    if (checkForWinSimulation(grid, blocked, row, col, PLAYER.BLUE)) {
      grid[row][col] = 0;
      return col;
    }
    grid[row][col] = 0;
  }
  const blockingMove = findImmediateThreat(grid, blocked);
  if (blockingMove !== -1) return blockingMove;
  const openTwoBlock = findOpenTwoThreatBlock(grid, blocked);
  if (openTwoBlock !== -1) return openTwoBlock;

  const candidatesAll = getCandidateMovesOrdered(
    grid,
    blocked,
    AI.CAND_LIMIT_IMP
  );
  const candidates = [];
  const unsafeScores = []; // track severity to choose the least-bad if needed

  for (const col of candidatesAll) {
    if (isHandingImmediateClose(grid, blocked, col, hashBase)) {
      unsafeScores.push({ col, sev: 999 });
      continue;
    }
    if (createsOpponentForkAfterOurMove(grid, blocked, col, hashBase)) {
      unsafeScores.push({ col, sev: 500 });
      continue;
    }
    candidates.push(col);
  }

  const history = Object.create(null);
  const killers = [];
  const nodeBudget = { count: AI.IMPOSSIBLE_NODE_BUDGET };
  const start = now();
  const timeBudget = AI.IMPOSSIBLE_MS;

  let bestCol = -1,
    pvMove = -1,
    lastScore = 0;
  const searchSet = candidates.length ? candidates : candidatesAll; // if all unsafe, we must pick something

  for (let d = 2; d <= cap; d++) {
    let bestScore = -Infinity;
    let localBest = -1;
    let alpha = lastScore - 120,
      beta = lastScore + 120; // aspiration

    for (const col of searchSet) {
      const move = applyMove(
        grid,
        blocked,
        col,
        PLAYER.BLUE,
        hashBase ^ Z_TURN,
        true
      );
      if (!move) continue;
      let score = minimaxTT({
        board: grid,
        blocked,
        depth: d - 1,
        isMax: false,
        alpha,
        beta,
        evalFn: evaluateBoardAdvanced,
        nodeBudget,
        timeBudget,
        startTime: start,
        hash: move.hash,
        history,
        killers,
        pvMove,
      });
      if (score <= alpha || score >= beta) {
        score = minimaxTT({
          board: grid,
          blocked,
          depth: d - 1,
          isMax: false,
          alpha: -Infinity,
          beta: Infinity,
          evalFn: evaluateBoardAdvanced,
          nodeBudget,
          timeBudget,
          startTime: start,
          hash: move.hash,
          history,
          killers,
          pvMove,
        });
      }
      undoMove(grid, blocked, move, hashBase, true);
      // Penalize unsafe candidates if we had to include them
      if (!candidates.length) {
        const sev = unsafeScores.find((u) => u.col === col)?.sev ?? 100;
        score -= sev; // push search away from obviously losing roots
      }
      if (score > bestScore) {
        bestScore = score;
        localBest = col;
      }
      if (
        nodeBudget.count <= 0 ||
        (timeBudget > 0 && now() - start > timeBudget)
      )
        break;
    }

    if (localBest !== -1) {
      bestCol = localBest;
      pvMove = localBest;
      lastScore = bestScore;
    }
    if (nodeBudget.count <= 0 || (timeBudget > 0 && now() - start > timeBudget))
      break;
  }

  if (bestCol === -1) {
    const legal = searchSet.filter((c) => canDropInColumn(grid, blocked, c));
    if (!legal.length) return -1;
    legal.sort((a, b) => Math.abs(a - COLS / 2) - Math.abs(b - COLS / 2));
    return legal[0];
  }
  return bestCol;
}
