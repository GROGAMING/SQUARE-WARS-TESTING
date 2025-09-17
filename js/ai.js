// File: src/ai.js
// Square Wars — Connect-4 variant AI (30x20), rules-correct search with section-closing.
// IMPOSSIBLE hardened: zero-tolerance on handing Red an immediate 4-in-a-row
// and proactive blocks for Red's one-move fork setups.

import { ROWS, COLS, PLAYER, DIRECTIONS, AI as AI_IN } from "./constants.js";

/* -------------------------------------------------------------------------- */
/* Public API                                                                */
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
/* Config & helpers                                                           */
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
/* Core rules (gravity + closing sections)                                    */
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
/* Zobrist hashing (incremental)                                              */
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
/* Move application with incremental hash                                     */
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
/* Candidate generation & ordering                                            */
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
/* Threat utilities                                                           */
/* -------------------------------------------------------------------------- */

/* UPDATED: enumerate all *current* immediate winning replies for Red. */
function findImmediateThreats(grid, blocked) {
  const threats = [];
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
    if (willClose) threats.push(col);
  }
  return threats;
}

/* How many (and which) Red one-ply wins exist after Blue plays `col`? */
function getOppImmediateWinsAfterOurMove(grid, blocked, col, hashBase = 0) {
  const wins = [];
  const m = applyMove(grid, blocked, col, PLAYER.BLUE, hashBase, false);
  if (!m) return { count: 9999, cols: wins };
  for (let opCol = 0; opCol < COLS; opCol++) {
    const om = applyMove(grid, blocked, opCol, PLAYER.RED, 0, false);
    if (!om) continue;
    const win =
      om.newlyClosed.length > 0 ||
      checkForWinSimulation(grid, blocked, om.row, om.col, PLAYER.RED);
    undoMove(grid, blocked, om, 0, false);
    if (win) wins.push(opCol);
  }
  undoMove(grid, blocked, m, hashBase, false);
  return { count: wins.length, cols: wins };
}

function countImmediateClosesFor(board, blocked, player) {
  let count = 0;
  const cols = [];
  for (let col = 0; col < COLS; col++) {
    const m = applyMove(board, blocked, col, player, 0, false);
    if (!m) continue;
    const close = m.newlyClosed.length > 0;
    undoMove(board, blocked, m, 0, false);
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

/* UPDATED: does Blue's move allow a Red fork in a single reply? */
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

  const imm = countImmediateClosesFor(grid, blocked, PLAYER.RED);
  if (imm.count > 0) {
    undoMove(grid, blocked, m, hashBase, false);
    return true;
  }

  for (let opCol = 0; opCol < COLS; opCol++) {
    const opM = applyMove(grid, blocked, opCol, PLAYER.RED, 0, false);
    if (!opM) continue;
    if (opM.newlyClosed.length > 0) {
      undoMove(grid, blocked, opM, 0, false);
      undoMove(grid, blocked, m, hashBase, false);
      return true;
    }
    const next = countImmediateClosesFor(grid, blocked, PLAYER.RED);
    undoMove(grid, blocked, opM, 0, false);
    if (next.count >= 2) {
      undoMove(grid, blocked, m, hashBase, false);
      return true;
    }
  }

  undoMove(grid, blocked, m, hashBase, false);
  return false;
}

/* UPDATED: proactively block Red's ONE-MOVE fork setup (before it happens). */
function findBlockForOpponentOneMoveFork(grid, blocked, hashBase = 0) {
  const setups = [];
  for (let opCol = 0; opCol < COLS; opCol++) {
    const opM = applyMove(grid, blocked, opCol, PLAYER.RED, hashBase, false);
    if (!opM) continue;
    if (opM.newlyClosed.length > 0) {
      // immediate win handled elsewhere
      undoMove(grid, blocked, opM, hashBase, false);
      continue;
    }
    const next = countImmediateClosesFor(grid, blocked, PLAYER.RED);
    undoMove(grid, blocked, opM, hashBase, false);
    if (next.count >= 2) setups.push({ setup: opCol, wins: next.cols });
  }
  if (!setups.length) return -1;

  // First choice: play in the exact setup column (deny the setup).
  const playables = setups
    .map((s) => s.setup)
    .filter((c, i, arr) => arr.indexOf(c) === i) // unique
    .filter((c) => canDropInColumn(grid, blocked, c));
  if (playables.length) {
    playables.sort((a, b) => Math.abs(a - COLS / 2) - Math.abs(b - COLS / 2));
    return playables[0];
  }

  // Second choice: pre-fill one of the would-be winning columns (if playable).
  const unionWins = new Set();
  for (const s of setups) for (const w of s.wins) unionWins.add(w);
  const winPlayables = [...unionWins].filter((c) =>
    canDropInColumn(grid, blocked, c)
  );
  if (winPlayables.length) {
    winPlayables.sort(
      (a, b) => Math.abs(a - COLS / 2) - Math.abs(b - COLS / 2)
    );
    return winPlayables[0];
  }

  return -1;
}

function softPenaltyAfterMove(grid, blocked, col, hashBase = 0) {
  const before = countImmediateClosesFor(grid, blocked, PLAYER.RED).count;
  const m = applyMove(grid, blocked, col, PLAYER.BLUE, hashBase, false);
  if (!m) return 10_000;
  const after = countImmediateClosesFor(grid, blocked, PLAYER.RED).count;
  undoMove(grid, blocked, m, hashBase, false);
  return after > before ? 50 * (after - before) : 0;
}

/* -------------------------------------------------------------------------- */
/* Evaluation (fast + strong)                                                 */
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
/* Transposition table & search                                               */
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
/* Difficulty entry points                                                    */
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
    const blockCol = findImmediateThreats(grid, blocked)[0] ?? -1;
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
  const blockingMove = findImmediateThreats(grid, blocked)[0] ?? -1;
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
  const blockingMove = findImmediateThreats(grid, blocked)[0] ?? -1;
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

/* ------------------------------ UPDATED PART ------------------------------ */

function getBestMoveImpossible(grid, blocked, hashBase, AI) {
  const base = AI.IMPOSSIBLE_DEPTH;
  const cap = effectiveDepth(base, grid, blocked, base);

  // A) Tactical fast paths: take win; block any current immediate threats.
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
  const nowThreats = findImmediateThreats(grid, blocked);
  if (nowThreats.length) {
    nowThreats.sort((a, b) => Math.abs(a - COLS / 2) - Math.abs(b - COLS / 2));
    return nowThreats[0];
  }

  // B) NEW: proactively block Red's one-move fork setup (two immediate wins next turn).
  const setupBlock = findBlockForOpponentOneMoveFork(grid, blocked, hashBase);
  if (setupBlock !== -1) return setupBlock;

  // C) Also block open-two motifs when available as a cheap heuristic.
  const openTwoBlock = findOpenTwoThreatBlock(grid, blocked);
  if (openTwoBlock !== -1) return openTwoBlock;

  // D) Strict root safety gate (same as before, but kept).
  const allLegal = [];
  for (let c = 0; c < COLS; c++)
    if (canDropInColumn(grid, blocked, c)) allLegal.push(c);

  const rootInfo = allLegal.map((c) => {
    const wins = getOppImmediateWinsAfterOurMove(grid, blocked, c, hashBase);
    const fork =
      wins.count === 0 &&
      createsOpponentForkAfterOurMove(grid, blocked, c, hashBase);
    const soft =
      wins.count === 0 && !fork
        ? softPenaltyAfterMove(grid, blocked, c, hashBase)
        : 0;
    return { c, wins, fork, soft };
  });

  let candidateCols = rootInfo
    .filter((x) => x.wins.count === 0 && !x.fork)
    .map((x) => x.c);
  if (!candidateCols.length)
    candidateCols = rootInfo.filter((x) => x.wins.count === 0).map((x) => x.c);

  if (!candidateCols.length) {
    const minWins = Math.min(...rootInfo.map((x) => x.wins.count));
    candidateCols = rootInfo
      .filter((x) => x.wins.count === minWins)
      .sort(
        (a, b) =>
          (a.fork === b.fork ? 0 : a.fork ? 1 : -1) ||
          a.soft - b.soft ||
          Math.abs(a.c - COLS / 2) - Math.abs(b.c - COLS / 2)
      )
      .map((x) => x.c);
  }

  const centerOrder = getCandidateMovesOrdered(grid, blocked, COLS);
  let searchSet = centerOrder.filter((c) => candidateCols.includes(c));
  searchSet = searchSet.slice(0, Math.max(AI.CAND_LIMIT_IMP, 6));

  const history = Object.create(null);
  const killers = [];
  const nodeBudget = { count: AI.IMPOSSIBLE_NODE_BUDGET };
  const start = now();
  const timeBudget = AI.IMPOSSIBLE_MS;

  let bestCol = -1,
    pvMove = -1,
    lastScore = 0;
  for (let d = 2; d <= cap; d++) {
    let bestScore = -Infinity;
    let localBest = -1;
    let alpha = lastScore - 120,
      beta = lastScore + 120;
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

  // E) Final zero-tolerance veto if a safe root exists.
  const chosen = rootInfo.find((x) => x.c === bestCol);
  const existsSafe = rootInfo.some((x) => x.wins.count === 0);
  if (chosen && chosen.wins.count > 0 && existsSafe) {
    const safest = rootInfo
      .filter((x) => x.wins.count === 0 && !x.fork)
      .sort((a, b) => Math.abs(a.c - COLS / 2) - Math.abs(b.c - COLS / 2));
    if (safest.length) return safest[0].c;

    const safeNoFork = rootInfo
      .filter((x) => x.wins.count === 0)
      .sort((a, b) => Math.abs(a.c - COLS / 2) - Math.abs(b.c - COLS / 2));
    if (safeNoFork.length) return safeNoFork[0].c;
  }

  if (bestCol === -1) {
    const safest = rootInfo
      .filter((x) => x.wins.count === 0)
      .sort((a, b) => Math.abs(a.c - COLS / 2) - Math.abs(b.c - COLS / 2));
    if (safest.length) return safest[0].c;

    const legal = centerOrder.filter((c) => canDropInColumn(grid, blocked, c));
    if (!legal.length) return -1;
    return legal[0];
  }
  return bestCol;
}

/* -------------------------------------------------------------------------- */
/* Backwards compat helpers used by lower diffs                               */
/* -------------------------------------------------------------------------- */

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
  let danger = false;
  for (let opCol = 0; opCol < COLS && !danger; opCol++) {
    const om = applyMove(grid, blocked, opCol, PLAYER.RED, 0, false);
    if (!om) continue;
    if (om.newlyClosed.length > 0) danger = true;
    undoMove(grid, blocked, om, 0, false);
  }
  undoMove(grid, blocked, m, hashBase, false);
  return danger;
}
