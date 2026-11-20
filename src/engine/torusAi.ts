// SPDX-License-Identifier: AGPL-3.0-or-later

/*
  TOROIDAL GO AI — PACHI-INSPIRED, NON-NEURAL SEARCH
  Supports arbitrary rectangular toroidal boards (width x height)
  and 2–4 player MaxN / UCT+RAVE search.
*/

import {
  ALL_PLAYERS,
  CellValue,
  computeKomiMap,
  EMPTY,
  getActivePlayers,
  GoGame,
  GOLD,
  mod,
  PlayerColor,
  PlayerCount,
  RED,
  VIOLET,
  WHITE,
} from './torusGo';

const PACHI_TORUS_CONFIG = Object.freeze({
  iterations: 260,
  rolloutDepth: 32,
  rootWidth: 16,
  treeWidth: 12,
  playoutWidth: 8,
  exploration: 1.18,
  raveEquivalence: 260,
  komi: 6.5,
});

interface AICandidateSummary {
  move: number;
  visits: number;
  value: number;
  prior: number;
}

interface AISearchResult {
  move: number;
  visits: number;
  value: number;
  iterations: number;
  topMoves: AICandidateSummary[];
  aborted?: boolean;
}

interface FastGroup {
  color: CellValue;
  stones: number[];
  liberties: number[];
}

interface MoveAnalysis {
  id: number;
  board: Uint8Array;
  key: string;
  captured: number;
  capturedSingleId: number | null;
  ownLiberties: number;
  ownSize: number;
}

interface CandidateMove {
  id: number;
  score: number;
  prior?: number;
  analysis: MoveAnalysis | null;
}

interface TrajectoryStep {
  color: PlayerColor;
  move: number;
}

const torusNeighborCache = new Map<string, number[][]>();

function getTorusNeighborTable(width: number, height: number): number[][] {
  const cacheKey = `${width}x${height}`;
  const existing = torusNeighborCache.get(cacheKey);
  if (existing) return existing;

  const table: number[][] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = y * width + x;
      table[id] = [
        y * width + mod(x + 1, width),
        y * width + mod(x - 1, width),
        mod(y + 1, height) * width + x,
        mod(y - 1, height) * width + x,
      ];
    }
  }
  torusNeighborCache.set(cacheKey, table);
  return table;
}

function getTorusDiagonalTable(width: number, height: number, id: number): number[] {
  const x = id % width;
  const y = Math.floor(id / width);
  const up = mod(y - 1, height);
  const down = mod(y + 1, height);
  const left = mod(x - 1, width);
  const right = mod(x + 1, width);
  return [
    up * width + left,
    up * width + right,
    down * width + left,
    down * width + right,
  ];
}

function fastPositionKey(board: Uint8Array): string {
  return Array.from(board).join('');
}

function fastGetGroup(board: Uint8Array, start: number, neighbors: number[][]): FastGroup {
  const color = board[start] as CellValue;
  if (color === EMPTY) return { color: EMPTY, stones: [], liberties: [] };

  const visited = new Uint8Array(board.length);
  const libertySeen = new Uint8Array(board.length);
  const stack: number[] = [start];
  const stones: number[] = [];
  const liberties: number[] = [];
  visited[start] = 1;

  while (stack.length > 0) {
    const id = stack.pop()!;
    stones.push(id);
    for (const next of neighbors[id]) {
      if (board[next] === EMPTY) {
        if (!libertySeen[next]) {
          libertySeen[next] = 1;
          liberties.push(next);
        }
      } else if (board[next] === color && !visited[next]) {
        visited[next] = 1;
        stack.push(next);
      }
    }
  }

  return { color, stones, liberties };
}

function fastFindGroups(
  board: Uint8Array,
  neighbors: number[][]
): { groups: FastGroup[]; groupAt: Int16Array } {
  const seen = new Uint8Array(board.length);
  const groups: FastGroup[] = [];
  const groupAt = new Int16Array(board.length);
  groupAt.fill(-1);

  for (let id = 0; id < board.length; id++) {
    if (board[id] === EMPTY || seen[id]) continue;
    const group = fastGetGroup(board, id, neighbors);
    const index = groups.length;
    for (const stone of group.stones) {
      seen[stone] = 1;
      groupAt[stone] = index;
    }
    groups.push(group);
  }

  return { groups, groupAt };
}

function torusDistanceMap(board: Uint8Array, width: number, height: number): Int16Array {
  const neighbors = getTorusNeighborTable(width, height);
  const dist = new Int16Array(board.length);
  dist.fill(32767);
  const queue = new Int32Array(board.length);
  let head = 0;
  let tail = 0;

  for (let id = 0; id < board.length; id++) {
    if (board[id] !== EMPTY) {
      dist[id] = 0;
      queue[tail++] = id;
    }
  }

  while (head < tail) {
    const id = queue[head++];
    const nextDist = dist[id] + 1;
    for (const next of neighbors[id]) {
      if (dist[next] > nextDist) {
        dist[next] = nextDist;
        queue[tail++] = next;
      }
    }
  }

  return dist;
}

class FastTorusState {
  public width: number;
  public height: number;
  public playerCount: PlayerCount;
  public activePlayers: PlayerColor[];
  public eliminatedPlayers: Set<PlayerColor>;
  public board: Uint8Array;
  public toMove: PlayerColor;
  public captures: Record<PlayerColor, number>;
  public passes: number;
  public koPoint: number | null;
  public neighbors: number[][];
  public seen: Set<string>;

  constructor(
    width: number,
    height: number,
    playerCount: PlayerCount,
    eliminatedPlayers: Set<PlayerColor>,
    board: Uint8Array,
    toMove: PlayerColor,
    captures: Record<PlayerColor, number>,
    passes: number,
    koPoint: number | null = null,
    seen?: Set<string>
  ) {
    this.width = width;
    this.height = height;
    this.playerCount = playerCount;
    this.activePlayers = getActivePlayers(playerCount).filter(
      (p) => !eliminatedPlayers.has(p)
    );
    this.eliminatedPlayers = new Set(eliminatedPlayers);
    this.board = board;
    this.toMove = toMove;
    this.captures = { ...captures };
    this.passes = passes;
    this.koPoint = koPoint;
    this.neighbors = getTorusNeighborTable(width, height);
    this.seen = seen || new Set([fastPositionKey(board)]);
  }

  public static fromGame(game: GoGame): FastTorusState {
    const board = new Uint8Array(game.width * game.height);
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        board[y * game.width + x] = game.board[y][x];
      }
    }
    const koPoint = game.koPoint ? game.koPoint.y * game.width + game.koPoint.x : null;
    // In 2P Japanese rules, only simple ko (koPoint) applies globally; keep seen local to search tree.
    const history =
      game.playerCount > 2 && game.positionHistory && game.positionHistory.length > 0
        ? game.positionHistory.slice()
        : [fastPositionKey(board)];
    return new FastTorusState(
      game.width,
      game.height,
      game.playerCount,
      game.eliminatedPlayers,
      board,
      game.currentPlayer,
      game.captures,
      game.consecutivePasses,
      koPoint,
      new Set(history)
    );
  }

  public clone(): FastTorusState {
    return new FastTorusState(
      this.width,
      this.height,
      this.playerCount,
      this.eliminatedPlayers,
      this.board.slice(),
      this.toMove,
      this.captures,
      this.passes,
      this.koPoint,
      new Set(this.seen)
    );
  }

  public nextPlayer(from: PlayerColor): PlayerColor {
    if (this.activePlayers.length === 0) return from;
    const idx = this.activePlayers.indexOf(from);
    if (idx === -1) return this.activePlayers[0];
    return this.activePlayers[(idx + 1) % this.activePlayers.length];
  }

  public isTerminal(): boolean {
    return this.passes >= Math.max(1, this.activePlayers.length);
  }

  public analyzeMove(id: number): MoveAnalysis | null {
    if (id < 0 || id >= this.board.length || this.board[id] !== EMPTY) return null;
    if (this.playerCount === 2 && this.koPoint === id) return null;
    const color = this.toMove;
    const nextBoard = this.board.slice();
    nextBoard[id] = color;
    const processedEnemy = new Uint8Array(nextBoard.length);
    let captured = 0;
    let capturedSingleId: number | null = null;

    for (const neighbor of this.neighbors[id]) {
      const cell = nextBoard[neighbor];
      if (cell === EMPTY || cell === color || processedEnemy[neighbor]) continue;
      const group = fastGetGroup(nextBoard, neighbor, this.neighbors);
      for (const stone of group.stones) processedEnemy[stone] = 1;
      if (group.liberties.length === 0) {
        for (const stone of group.stones) {
          nextBoard[stone] = EMPTY;
          capturedSingleId = stone;
        }
        captured += group.stones.length;
      }
    }

    const ownGroup = fastGetGroup(nextBoard, id, this.neighbors);
    if (ownGroup.liberties.length === 0) return null;
    const key = fastPositionKey(nextBoard);
    if (this.seen.has(key)) return null;

    return {
      id,
      board: nextBoard,
      key,
      captured,
      capturedSingleId: captured === 1 ? capturedSingleId : null,
      ownLiberties: ownGroup.liberties.length,
      ownSize: ownGroup.stones.length,
    };
  }

  public applyAnalysis(analysis: MoveAnalysis): void {
    const color = this.toMove;
    this.board = analysis.board;
    this.captures[color] += analysis.captured;
    this.koPoint =
      this.playerCount === 2 &&
      analysis.captured === 1 &&
      analysis.ownSize === 1 &&
      analysis.ownLiberties === 1
        ? analysis.capturedSingleId
        : null;
    this.seen.add(analysis.key);
    this.toMove = this.nextPlayer(color);
    this.passes = 0;
  }

  public pass(): void {
    this.passes++;
    this.koPoint = null;
    this.toMove = this.nextPlayer(this.toMove);
  }

  public emptyCount(): number {
    let count = 0;
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === EMPTY) count++;
    }
    return count;
  }
}

function isClearFriendlyEye(
  board: Uint8Array,
  id: number,
  color: PlayerColor,
  groupAt: Int16Array,
  groups: FastGroup[],
  width: number,
  height: number
): boolean {
  const neighbors = getTorusNeighborTable(width, height)[id];
  const firstGroup = groupAt[neighbors[0]];
  if (firstGroup < 0 || groups[firstGroup].color !== color) return false;
  if (!neighbors.every((next) => board[next] === color && groupAt[next] === firstGroup)) {
    return false;
  }
  if (groups[firstGroup].liberties.length <= 1) return false;

  const diagonal = getTorusDiagonalTable(width, height, id);
  let friendlyDiagonals = 0;
  for (const point of diagonal) {
    if (board[point] === color) friendlyDiagonals++;
  }
  return friendlyDiagonals >= 3;
}

function getMovePatternScore(
  state: FastTorusState,
  id: number,
  groups: FastGroup[],
  groupAt: Int16Array,
  distance: Int16Array | null,
  options: { playout?: boolean; occupiedRatio?: number } = {}
): CandidateMove | null {
  const board = state.board;
  const color = state.toMove;
  const neighbors = state.neighbors[id];
  const adjacentGroups = new Set<number>();

  let adjacentEmpty = 0;
  let friendlyGroups = 0;
  let enemyGroups = 0;
  let captures = 0;
  let saves = 0;
  let atariThreats = 0;
  let friendlyAdjacentStones = 0;
  let enemyAdjacentStones = 0;

  for (const next of neighbors) {
    if (board[next] === EMPTY) {
      adjacentEmpty++;
      continue;
    }
    if (board[next] === color) friendlyAdjacentStones++;
    else enemyAdjacentStones++;

    const gi = groupAt[next];
    if (gi < 0 || adjacentGroups.has(gi)) continue;
    adjacentGroups.add(gi);
    const group = groups[gi];

    if (group.color === color) {
      friendlyGroups++;
      if (group.liberties.length === 1 && group.liberties[0] === id) {
        saves += group.stones.length;
      }
    } else {
      enemyGroups++;
      if (group.liberties.length === 1 && group.liberties[0] === id) {
        captures += group.stones.length;
      } else if (group.liberties.length === 2 && group.liberties.includes(id)) {
        atariThreats += Math.max(1, group.stones.length * 0.35);
      }
    }
  }

  if (
    isClearFriendlyEye(board, id, color, groupAt, groups, state.width, state.height) &&
    captures === 0 &&
    saves === 0
  ) {
    return null;
  }

  const analysis = state.analyzeMove(id);
  if (!analysis) return null;

  const diagonal = getTorusDiagonalTable(state.width, state.height, id);
  let friendlyDiagonal = 0;
  let enemyDiagonal = 0;
  let emptyDiagonal = 0;
  for (const point of diagonal) {
    if (board[point] === color) friendlyDiagonal++;
    else if (board[point] !== EMPTY) enemyDiagonal++;
    else emptyDiagonal++;
  }

  let score = 0;
  score += captures * 18;
  score += saves * 12;
  score += atariThreats * 4.2;

  if (friendlyGroups >= 2) score += 3.4 + Math.min(3, friendlyGroups - 2) * 0.8;
  if (enemyGroups >= 2) score += 1.8 + Math.min(2, enemyGroups - 2) * 0.5;
  if (friendlyAdjacentStones > 0 && enemyAdjacentStones > 0) score += 0.8;

  score += Math.min(adjacentEmpty, 3) * 0.36;
  score += friendlyDiagonal * 0.23;
  score += enemyDiagonal * 0.3;
  if (emptyDiagonal === 4 && adjacentEmpty >= 2) score += 0.55;
  if (adjacentEmpty === 0 && captures === 0 && saves === 0) score -= 4.5;

  if (analysis.ownLiberties === 1 && captures === 0) {
    score -= 22 + Math.min(analysis.ownSize, 12) * 1.2;
  } else if (analysis.ownLiberties === 2) {
    score -= 4.2;
  } else {
    score += Math.min(analysis.ownLiberties, 5) * 0.3;
  }

  if (analysis.captured) score += 4.5 + analysis.captured * 1.5;

  const d = distance ? distance[id] : 32767;
  const occupiedRatio =
    options.occupiedRatio !== undefined && Number.isFinite(options.occupiedRatio)
      ? options.occupiedRatio
      : (board.length - state.emptyCount()) / board.length;

  if (d === 1) score += 0.15;
  else if (d === 2) score += 1.65;
  else if (d === 3) score += 2.15;
  else if (d === 4) score += 1.75;
  else if (d === 5) score += 1.1;
  else if (d >= 6 && d < 32767) score += occupiedRatio < 0.48 ? 1.35 : 0.22;

  if (friendlyGroups === 0 && enemyGroups === 0) {
    score += occupiedRatio < 0.45 ? 0.9 : -0.5;
  }

  return {
    id,
    score,
    analysis,
  };
}

function shouldOfferTorusPass(
  state: FastTorusState,
  bestScore: number,
  groups: FastGroup[]
): boolean {
  const occupied = state.board.length - state.emptyCount();
  if (occupied === 0) return false;
  if (groups.some((group) => group.liberties.length <= 2)) return false;
  const ratio = occupied / state.board.length;
  const threshold = ratio >= 0.72 ? 2.45 : ratio >= 0.52 ? 1.55 : ratio >= 0.28 ? 0.95 : 0.35;
  return bestScore < threshold;
}

function generateTorusCandidates(
  state: FastTorusState,
  maxCount = 12,
  options: { playout?: boolean; occupiedRatio?: number } = {}
): CandidateMove[] {
  const board = state.board;
  const groupsInfo = fastFindGroups(board, state.neighbors);
  const groups = groupsInfo.groups;
  const groupAt = groupsInfo.groupAt;
  const occupied = board.length - state.emptyCount();
  const opts = { ...options, occupiedRatio: occupied / board.length };

  if (occupied === 0) {
    const id = Math.floor(state.height / 2) * state.width + Math.floor(state.width / 2);
    const analysis = state.analyzeMove(id);
    return analysis
      ? [{ id, score: 1, prior: 1, analysis }]
      : [{ id: -1, score: 0, prior: 1, analysis: null }];
  }

  const distance = torusDistanceMap(board, state.width, state.height);
  const cheap: CandidateMove[] = [];
  let scanIds: number[];

  if (opts.playout) {
    const sample = new Set<number>();
    const frontier: number[] = [];
    for (const group of groups) {
      if (group.liberties.length <= 3) {
        for (const liberty of group.liberties) sample.add(liberty);
      }
      for (const stone of group.stones) {
        for (const next of state.neighbors[stone]) {
          if (board[next] === EMPTY) frontier.push(next);
        }
      }
    }
    for (let i = frontier.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [frontier[i], frontier[j]] = [frontier[j], frontier[i]];
    }
    for (let i = 0; i < Math.min(22, frontier.length); i++) sample.add(frontier[i]);
    let attempts = 0;
    while (sample.size < 42 && attempts < 240) {
      const id = Math.floor(Math.random() * board.length);
      if (board[id] === EMPTY) sample.add(id);
      attempts++;
    }
    scanIds = Array.from(sample).filter((id) => board[id] === EMPTY);
  } else {
    scanIds = [];
    for (let id = 0; id < board.length; id++) {
      if (board[id] === EMPTY) scanIds.push(id);
    }
  }

  for (const id of scanIds) {
    const item = getMovePatternScore(state, id, groups, groupAt, distance, opts);
    if (item) cheap.push(item);
  }

  if (!cheap.length) return [{ id: -1, score: 0, prior: 1, analysis: null }];

  cheap.sort((a, b) => b.score - a.score || a.id - b.id);
  const bestScore = cheap[0].score;
  const passIsReasonable = shouldOfferTorusPass(state, bestScore, groups);

  const ratio = occupied / board.length;
  const baseThresh = ratio >= 0.72 ? 2.45 : ratio >= 0.52 ? 1.55 : ratio >= 0.28 ? 0.95 : 0.35;
  const passOnlyThreshold = Math.max(0.65, baseThresh * 0.66);

  if (passIsReasonable && bestScore < passOnlyThreshold) {
    return [{ id: -1, score: bestScore + 0.2, prior: 1, analysis: null }];
  }

  const width = Math.min(cheap.length, Math.max(maxCount, opts.playout ? 6 : 12));
  const selected = cheap.slice(0, width);
  if (passIsReasonable) {
    const passPenalty = ratio >= 0.72 ? 0.75 : ratio >= 0.52 ? 1.7 : 3.0;
    selected.push({ id: -1, score: bestScore - passPenalty, analysis: null });
  }

  const maxScore = selected[0].score;
  const temperature = opts.playout ? 1.25 : 2.2;
  const weights = selected.map((item) =>
    item.id < 0
      ? Math.exp((item.score - maxScore) / temperature) * 0.24
      : Math.exp((item.score - maxScore) / temperature)
  );
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  selected.forEach((item, i) => {
    item.prior = weights[i] / sum;
  });
  return selected;
}

function evaluateAllPlayers(
  state: FastTorusState,
  komi: number = PACHI_TORUS_CONFIG.komi
): Record<PlayerColor, number> {
  const board = state.board;
  const neighbors = state.neighbors;
  const komiMap = computeKomiMap(state.playerCount, komi);
  const active = state.activePlayers;

  // Japanese Territory Scoring baseline: captured prisoners + komi
  const raw: Record<PlayerColor, number> = {
    [WHITE]: state.captures[WHITE] + komiMap[WHITE],
    [RED]: state.captures[RED] + komiMap[RED],
    [GOLD]: state.captures[GOLD] + komiMap[GOLD],
    [VIOLET]: state.captures[VIOLET] + komiMap[VIOLET],
  };

  const visited = new Uint8Array(board.length);
  for (let start = 0; start < board.length; start++) {
    if (board[start] !== EMPTY || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let regionSize = 0;
    let borderMask = 0;

    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      regionSize++;
      for (const next of neighbors[id]) {
        const cell = board[next];
        if (cell === EMPTY && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        } else if (cell !== EMPTY) {
          borderMask |= 1 << cell;
        }
      }
    }

    // Check if exactly one bit is set in borderMask
    if (borderMask !== 0 && (borderMask & (borderMask - 1)) === 0) {
      const owner = Math.log2(borderMask) as PlayerColor;
      raw[owner] += regionSize;
    }
  }

  if (!state.isTerminal()) {
    const { groups } = fastFindGroups(board, neighbors);
    for (const group of groups) {
      if (group.color === EMPTY) continue;
      const weight = Math.min(group.stones.length, 10);
      let penalty = 0;
      if (group.liberties.length === 1) penalty = 3.2 + weight * 0.52;
      else if (group.liberties.length === 2) penalty = 0.9 + weight * 0.12;
      else if (group.liberties.length === 3) penalty = 0.12;
      raw[group.color] -= penalty;
    }

    // Multi-player toroidal influence estimate
    const distances = new Map<PlayerColor, Int16Array>();
    for (const p of active) {
      const dist = new Int16Array(board.length);
      dist.fill(32767);
      const queue = new Int32Array(board.length);
      let head = 0;
      let tail = 0;
      for (let id = 0; id < board.length; id++) {
        if (board[id] === p) {
          dist[id] = 0;
          queue[tail++] = id;
        }
      }
      if (tail > 0) {
        while (head < tail) {
          const id = queue[head++];
          const nextDist = dist[id] + 1;
          for (const next of neighbors[id]) {
            if (dist[next] > nextDist) {
              dist[next] = nextDist;
              queue[tail++] = next;
            }
          }
        }
        distances.set(p, dist);
      }
    }

    if (distances.size >= 2) {
      for (let id = 0; id < board.length; id++) {
        if (board[id] !== EMPTY) continue;
        let bestDist = 32767;
        let bestPlayer: PlayerColor | null = null;
        let tied = false;

        for (const [p, dist] of distances.entries()) {
          const d = dist[id];
          if (d < bestDist) {
            bestDist = d;
            bestPlayer = p;
            tied = false;
          } else if (d === bestDist) {
            tied = true;
          }
        }

        if (!tied && bestPlayer !== null && bestDist <= 4) {
          raw[bestPlayer] += (5 - bestDist) * 0.045;
        }
      }
    }
  }

  const avgDim = (state.width + state.height) / 2;
  const scale = Math.max(12, avgDim * 0.82);
  const evalMap: Record<PlayerColor, number> = {
    [WHITE]: 0,
    [RED]: 0,
    [GOLD]: 0,
    [VIOLET]: 0,
  };

  for (const p of active) {
    let bestOpponent = -Infinity;
    for (const other of active) {
      if (other !== p && raw[other] > bestOpponent) {
        bestOpponent = raw[other];
      }
    }
    if (bestOpponent === -Infinity) bestOpponent = 0;
    evalMap[p] = Math.tanh((raw[p] - bestOpponent) / scale);
  }

  return evalMap;
}

function chooseMoggyPlayoutMove(candidates: CandidateMove[]): CandidateMove {
  if (candidates.length === 1) return candidates[0];
  const topScore = candidates[0].score;
  const weights = candidates.map((candidate) =>
    candidate.id < 0 ? 0.1 : Math.exp((candidate.score - topScore) / 1.65)
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function runMoggyTorusPlayout(
  startState: FastTorusState,
  maxDepth: number,
  trajectory: TrajectoryStep[]
): FastTorusState {
  const state = startState.clone();
  let depth = 0;
  while (depth < maxDepth && !state.isTerminal()) {
    const candidates = generateTorusCandidates(state, PACHI_TORUS_CONFIG.playoutWidth, {
      playout: true,
    });
    const chosen = chooseMoggyPlayoutMove(candidates);
    if (!chosen || chosen.id < 0 || !chosen.analysis) {
      trajectory.push({ color: state.toMove, move: -1 });
      state.pass();
    } else {
      trajectory.push({ color: state.toMove, move: chosen.id });
      state.applyAnalysis(chosen.analysis);
    }
    depth++;
  }
  return state;
}

class TorusSearchNode {
  public state: FastTorusState;
  public parent: TorusSearchNode | null;
  public move: number | null;
  public prior: number;
  public startPly: number;
  public children: TorusSearchNode[];
  public candidates: CandidateMove[] | null;
  public visits: number;
  public valueSums: Record<PlayerColor, number>;
  public raveStats: Map<number, { visits: number; value: number }>;

  constructor(
    state: FastTorusState,
    parent: TorusSearchNode | null = null,
    move: number | null = null,
    prior = 1,
    startPly = 0
  ) {
    this.state = state;
    this.parent = parent;
    this.move = move;
    this.prior = prior;
    this.startPly = startPly;
    this.children = [];
    this.candidates = null;
    this.visits = 0;
    this.valueSums = { [WHITE]: 0, [RED]: 0, [GOLD]: 0, [VIOLET]: 0 };
    this.raveStats = new Map();
  }
}

export class PachiInspiredTorusAI {
  private static selectChild(node: TorusSearchNode): TorusSearchNode | null {
    const logVisits = Math.log(node.visits + 1);
    const mover = node.state.toMove;
    let best: TorusSearchNode | null = null;
    let bestScore = -Infinity;

    for (const child of node.children) {
      const q = child.visits ? child.valueSums[mover] / child.visits : 0;
      const amaf = child.move !== null ? node.raveStats.get(child.move) : undefined;
      const raveVisits = amaf ? amaf.visits : 0;
      const raveQ = raveVisits && amaf ? amaf.value / raveVisits : q;
      const beta = raveVisits
        ? raveVisits /
          (raveVisits +
            child.visits +
            (raveVisits * child.visits) / PACHI_TORUS_CONFIG.raveEquivalence +
            1)
        : 0;
      const blended = (1 - beta) * q + beta * raveQ;
      const exploration =
        PACHI_TORUS_CONFIG.exploration * Math.sqrt(logVisits / (child.visits + 1));
      const priorBonus =
        (0.18 * child.prior * Math.sqrt(node.visits + 1)) / (child.visits + 1);
      const score = blended + exploration + priorBonus;

      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }

    return best;
  }

  public static async search(
    game: GoGame,
    options: { komi?: number } = {},
    shouldAbort: () => boolean = () => false
  ): Promise<AISearchResult> {
    const iterations = PACHI_TORUS_CONFIG.iterations;
    const rolloutDepth = PACHI_TORUS_CONFIG.rolloutDepth;
    const komi = Number.isFinite(Number(options.komi))
      ? Number(options.komi)
      : PACHI_TORUS_CONFIG.komi;

    const rootState = FastTorusState.fromGame(game);
    const rootMover = rootState.toMove;
    const root = new TorusSearchNode(rootState);
    root.candidates = generateTorusCandidates(rootState, PACHI_TORUS_CONFIG.rootWidth);
    if (!root.candidates.length) {
      root.candidates = [{ id: -1, score: 0, prior: 1, analysis: null }];
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
      if (shouldAbort()) {
        return {
          move: -1,
          visits: 0,
          value: 0,
          iterations: iteration,
          topMoves: [],
          aborted: true,
        };
      }

      let node = root;
      const path: TorusSearchNode[] = [root];
      const trajectory: TrajectoryStep[] = [];

      while (!node.state.isTerminal()) {
        if (node.candidates === null) {
          node.candidates = generateTorusCandidates(node.state, PACHI_TORUS_CONFIG.treeWidth);
        }
        if (node.children.length < node.candidates.length) {
          const candidate = node.candidates[node.children.length];
          const childState = node.state.clone();
          if (candidate.id < 0 || !candidate.analysis) {
            childState.pass();
          } else {
            childState.applyAnalysis(candidate.analysis);
          }
          trajectory.push({ color: node.state.toMove, move: candidate.id });
          const child = new TorusSearchNode(
            childState,
            node,
            candidate.id,
            candidate.prior ?? 1,
            trajectory.length
          );
          node.children.push(child);
          node = child;
          path.push(node);
          break;
        }
        if (!node.children.length) break;
        const child = PachiInspiredTorusAI.selectChild(node);
        if (!child) break;
        trajectory.push({ color: node.state.toMove, move: child.move ?? -1 });
        node = child;
        path.push(node);
      }

      const rolloutState = runMoggyTorusPlayout(node.state, rolloutDepth, trajectory);
      const evalMap = evaluateAllPlayers(rolloutState, komi);

      for (let p = path.length - 1; p >= 0; p--) {
        const visited = path[p];
        visited.visits++;
        for (const color of ALL_PLAYERS) {
          visited.valueSums[color] += evalMap[color];
        }

        const moverAtNode = visited.state.toMove;
        const nodeValue = evalMap[moverAtNode];
        const seenMoves = new Set<number>();
        for (let t = visited.startPly; t < trajectory.length; t++) {
          const record = trajectory[t];
          if (record.color !== moverAtNode || record.move < 0 || seenMoves.has(record.move)) {
            continue;
          }
          seenMoves.add(record.move);
          let stat = visited.raveStats.get(record.move);
          if (!stat) {
            stat = { visits: 0, value: 0 };
            visited.raveStats.set(record.move, stat);
          }
          stat.visits++;
          stat.value += nodeValue;
        }
      }

      if ((iteration + 1) % 8 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    const ranked: AICandidateSummary[] = root.children
      .map((child) => ({
        move: child.move ?? -1,
        visits: child.visits,
        value: child.visits ? child.valueSums[rootMover] / child.visits : -1,
        prior: child.prior,
      }))
      .sort((a, b) => b.visits - a.visits || b.value - a.value);

    const best = ranked[0] || {
      move: root.candidates[0]?.id ?? -1,
      visits: 0,
      value: 0,
      prior: 1,
    };

    return {
      move: best.move,
      visits: best.visits,
      value: best.value,
      iterations,
      topMoves: ranked.slice(0, 5),
    };
  }
}
