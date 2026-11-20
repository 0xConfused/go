// SPDX-License-Identifier: AGPL-3.0-or-later

export const EMPTY = 0 as const;
export const WHITE = 1 as const;
export const RED = 2 as const;
export const GOLD = 3 as const;
export const VIOLET = 4 as const;

export type PlayerColor = typeof WHITE | typeof RED | typeof GOLD | typeof VIOLET;
export type CellValue = typeof EMPTY | PlayerColor;
export type PlayerCount = 2 | 3 | 4;
export type GameMode = 'play' | 'setup';

export const ALL_PLAYERS: readonly PlayerColor[] = [WHITE, RED, GOLD, VIOLET];

export const MIN_BOARD_DIM = 5;
export const MAX_BOARD_DIM = 25;

interface PlayerMeta {
  id: PlayerColor;
  name: 'WHITE' | 'RED' | 'GOLD' | 'VIOLET';
  swatchClass: string;
  turnCardClass: string;
  turnTextClass: string;
  stoneGradient: [string, string, string];
  stoneBorder: string;
  markerFill: string;
  territoryFill: string;
  territoryStroke: string;
}

export const PLAYER_META: Record<PlayerColor, PlayerMeta> = {
  [WHITE]: {
    id: WHITE,
    name: 'WHITE',
    swatchClass: 'bg-[#f0f0f0] border-[#8c8c8c]',
    turnCardClass: 'border-[#f0f0f0] bg-[#f0f0f0]/12',
    turnTextClass: 'text-[#f0f0f0]',
    stoneGradient: ['#ffffff', '#e6e6ea', '#9a9aa4'],
    stoneBorder: 'rgba(255, 255, 255, 0.35)',
    markerFill: '#0d0d0d',
    territoryFill: 'rgba(240, 240, 240, 0.22)',
    territoryStroke: 'rgba(240, 240, 240, 0.45)',
  },
  [RED]: {
    id: RED,
    name: 'RED',
    swatchClass: 'bg-[#c30800] border-[#f60a00]',
    turnCardClass: 'border-[#c30800] bg-[#c30800]/16',
    turnTextClass: 'text-[#f60a00]',
    stoneGradient: ['#ff4b42', '#c30800', '#660400'],
    stoneBorder: 'rgba(246, 10, 0, 0.45)',
    markerFill: '#f3f3f7',
    territoryFill: 'rgba(195, 8, 0, 0.28)',
    territoryStroke: 'rgba(246, 10, 0, 0.55)',
  },
  [GOLD]: {
    id: GOLD,
    name: 'GOLD',
    swatchClass: 'bg-[#bbc300] border-[#dce600]',
    turnCardClass: 'border-[#bbc300] bg-[#bbc300]/14',
    turnTextClass: 'text-[#bbc300]',
    stoneGradient: ['#f2fa46', '#bbc300', '#656900'],
    stoneBorder: 'rgba(220, 230, 0, 0.45)',
    markerFill: '#0d0d0d',
    territoryFill: 'rgba(187, 195, 0, 0.22)',
    territoryStroke: 'rgba(187, 195, 0, 0.50)',
  },
  [VIOLET]: {
    id: VIOLET,
    name: 'VIOLET',
    swatchClass: 'bg-[#c300bb] border-[#f02ae8]',
    turnCardClass: 'border-[#c300bb] bg-[#c300bb]/16',
    turnTextClass: 'text-[#f02ae8]',
    stoneGradient: ['#ff6cf9', '#c300bb', '#5e005a'],
    stoneBorder: 'rgba(240, 42, 232, 0.45)',
    markerFill: '#f3f3f7',
    territoryFill: 'rgba(195, 0, 187, 0.24)',
    territoryStroke: 'rgba(240, 42, 232, 0.50)',
  },
};

interface Point {
  x: number;
  y: number;
}

interface GroupInfo {
  stones: [number, number][];
  liberties: Set<number>;
}

interface LegalCheckResult {
  legal: boolean;
  reason?: 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'KO_VIOLATION' | 'SUICIDE' | 'POSITIONAL_SUPERKO';
}

interface MoveResult {
  success: boolean;
  captured: number;
  gameOver?: boolean;
  reason?: string;
}

interface HistoryEntry {
  board: CellValue[][];
  captures: Record<PlayerColor, number>;
  player: PlayerColor;
  koPoint: Point | null;
  lastMove: Point | null;
  consecutivePasses: number;
  eliminatedPlayers: PlayerColor[];
  positionHistoryLength: number;
}

export interface ScoreResult {
  territory: Record<PlayerColor, number>;
  komiByPlayer: Record<PlayerColor, number>;
  scores: Record<PlayerColor, number>;
  winner: PlayerColor | null;
  territoryOwner: CellValue[][];
}

export function clampBoardDim(val: number): number {
  if (!Number.isFinite(val)) return 19;
  return Math.max(MIN_BOARD_DIM, Math.min(MAX_BOARD_DIM, Math.round(val)));
}

export function getActivePlayers(playerCount: PlayerCount): PlayerColor[] {
  return ALL_PLAYERS.slice(0, playerCount);
}

export function computeKomiMap(
  playerCount: PlayerCount,
  komi: number
): Record<PlayerColor, number> {
  const map: Record<PlayerColor, number> = {
    [WHITE]: 0,
    [RED]: 0,
    [GOLD]: 0,
    [VIOLET]: 0,
  };
  if (playerCount === 2) {
    map[RED] = komi;
    return map;
  }
  const active = getActivePlayers(playerCount);
  for (let i = 1; i < active.length; i++) {
    const p = active[i];
    const scaled = (i / (active.length - 1)) * komi;
    map[p] = Math.round(scaled * 2) / 2;
  }
  return map;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

// 25 columns skipping 'I' per Go convention
export const GO_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function coordToLabel(x: number, y: number, height: number): string {
  const col = GO_COLUMNS[x] ?? `?${x}`;
  return `${col}${height - y}`;
}

export function colorName(c: PlayerColor): 'WHITE' | 'RED' | 'GOLD' | 'VIOLET' {
  return PLAYER_META[c].name;
}

export class GoGame {
  public width: number;
  public height: number;
  public playerCount: PlayerCount;
  public board: CellValue[][];
  public currentPlayer: PlayerColor;
  public captures: Record<PlayerColor, number>;
  public eliminatedPlayers: Set<PlayerColor>;
  public history: HistoryEntry[];
  public koPoint: Point | null;
  public consecutivePasses: number;
  public gameOver: boolean;
  public winner: PlayerColor | null;
  public lastMove: Point | null;
  public positionHistory: string[];
  public positionHistorySet: Set<string>;
  public turnPositionHistory: string[];
  public turnPositionCounts: Map<string, number>;

  constructor(width = 19, height = 19, playerCount: PlayerCount = 2) {
    this.width = clampBoardDim(width);
    this.height = clampBoardDim(height);
    this.playerCount = playerCount;
    this.board = [];
    this.currentPlayer = WHITE;
    this.captures = { [WHITE]: 0, [RED]: 0, [GOLD]: 0, [VIOLET]: 0 };
    this.eliminatedPlayers = new Set();
    this.history = [];
    this.koPoint = null;
    this.consecutivePasses = 0;
    this.gameOver = false;
    this.winner = null;
    this.lastMove = null;
    this.positionHistory = [];
    this.positionHistorySet = new Set();
    this.turnPositionHistory = [];
    this.turnPositionCounts = new Map();
    this.reset();
  }

  public reset(): void {
    this.board = Array.from({ length: this.height }, () =>
      new Array<CellValue>(this.width).fill(EMPTY)
    );
    this.currentPlayer = WHITE;
    this.captures = { [WHITE]: 0, [RED]: 0, [GOLD]: 0, [VIOLET]: 0 };
    this.eliminatedPlayers = new Set();
    this.history = [];
    this.koPoint = null;
    this.consecutivePasses = 0;
    this.gameOver = false;
    this.winner = null;
    this.lastMove = null;
    this.resetPositionHistory();
  }

  public getActivePlayersList(): PlayerColor[] {
    return getActivePlayers(this.playerCount);
  }

  public getRemainingPlayersCount(): number {
    return this.playerCount - this.eliminatedPlayers.size;
  }

  public nextActivePlayer(from: PlayerColor): PlayerColor {
    const active = this.getActivePlayersList();
    const startIdx = active.indexOf(from);
    for (let offset = 1; offset <= active.length; offset++) {
      const candidate = active[(startIdx + offset) % active.length];
      if (!this.eliminatedPlayers.has(candidate)) {
        return candidate;
      }
    }
    return from;
  }

  public positionKey(board: CellValue[][] = this.board): string {
    return board.map((row) => row.join('')).join('');
  }

  public resetPositionHistory(): void {
    const key = this.positionKey(this.board);
    const turnKey = `${key}|${this.currentPlayer}`;
    this.positionHistory = [key];
    this.positionHistorySet = new Set([key]);
    this.turnPositionHistory = [turnKey];
    this.turnPositionCounts = new Map([[turnKey, 1]]);
  }

  public neighbors(x: number, y: number): [number, number][] {
    const w = this.width;
    const h = this.height;
    return [
      [(x + 1) % w, y],
      [(x - 1 + w) % w, y],
      [x, (y + 1) % h],
      [x, (y - 1 + h) % h],
    ];
  }

  public getGroup(board: CellValue[][], x: number, y: number): GroupInfo {
    const color = board[y][x];
    if (color === EMPTY) return { stones: [], liberties: new Set() };
    const w = this.width;
    const h = this.height;
    const visited = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
    const stones: [number, number][] = [];
    const liberties = new Set<number>();
    const stack: [number, number][] = [[x, y]];
    visited[y][x] = true;

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      stones.push([cx, cy]);
      for (const [nx, ny] of this.neighbors(cx, cy)) {
        if (board[ny][nx] === EMPTY) {
          liberties.add(ny * w + nx);
        } else if (board[ny][nx] === color && !visited[ny][nx]) {
          visited[ny][nx] = true;
          stack.push([nx, ny]);
        }
      }
    }

    return { stones, liberties };
  }

  public findAllGroups(board: CellValue[][] = this.board): GroupInfo[] {
    const visited = Array.from({ length: this.height }, () =>
      new Array<boolean>(this.width).fill(false)
    );
    const groups: GroupInfo[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (board[y][x] === EMPTY || visited[y][x]) continue;
        const g = this.getGroup(board, x, y);
        for (const [sx, sy] of g.stones) visited[sy][sx] = true;
        groups.push(g);
      }
    }

    return groups;
  }

  public findAtariStoneKeys(): Set<number> {
    const set = new Set<number>();
    const groups = this.findAllGroups(this.board);
    for (const g of groups) {
      if (g.liberties.size === 1) {
        for (const [sx, sy] of g.stones) {
          set.add(sy * this.width + sx);
        }
      }
    }
    return set;
  }

  public isLegalMove(x: number, y: number, color: PlayerColor): LegalCheckResult {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return { legal: false, reason: 'OUT_OF_BOUNDS' };
    }
    if (this.board[y][x] !== EMPTY) {
      return { legal: false, reason: 'OCCUPIED' };
    }
    if (this.playerCount === 2 && this.koPoint && this.koPoint.x === x && this.koPoint.y === y) {
      return { legal: false, reason: 'KO_VIOLATION' };
    }

    const testBoard = this.board.map((r) => r.slice());
    testBoard[y][x] = color;

    for (const [nx, ny] of this.neighbors(x, y)) {
      const neighborCell = testBoard[ny][nx];
      if (neighborCell !== EMPTY && neighborCell !== color) {
        const g = this.getGroup(testBoard, nx, ny);
        if (g.liberties.size === 0) {
          for (const [sx, sy] of g.stones) {
            testBoard[sy][sx] = EMPTY;
          }
        }
      }
    }

    const ownGroup = this.getGroup(testBoard, x, y);
    if (ownGroup.liberties.size === 0) {
      return { legal: false, reason: 'SUICIDE' };
    }

    // Japanese rules use Simple Ko in 2-player games (allowing triple-ko / longer cycles);
    // multi-player (3P/4P) retains positional superko to prevent multi-way cycles.
    if (this.playerCount > 2) {
      const key = this.positionKey(testBoard);
      if (this.positionHistorySet.has(key)) {
        return { legal: false, reason: 'POSITIONAL_SUPERKO' };
      }
    }

    return { legal: true };
  }

  public playMove(x: number, y: number): MoveResult {
    if (this.gameOver) return { success: false, captured: 0, reason: 'GAME_OVER' };
    const check = this.isLegalMove(x, y, this.currentPlayer);
    if (!check.legal) return { success: false, captured: 0, reason: check.reason };

    this.history.push({
      board: this.board.map((r) => r.slice()),
      captures: { ...this.captures },
      player: this.currentPlayer,
      koPoint: this.koPoint,
      lastMove: this.lastMove,
      consecutivePasses: this.consecutivePasses,
      eliminatedPlayers: Array.from(this.eliminatedPlayers),
      positionHistoryLength: this.positionHistory.length,
    });

    const color = this.currentPlayer;
    this.board[y][x] = color;
    const capturedStones: [number, number][] = [];

    for (const [nx, ny] of this.neighbors(x, y)) {
      const neighborCell = this.board[ny][nx];
      if (neighborCell !== EMPTY && neighborCell !== color) {
        const g = this.getGroup(this.board, nx, ny);
        if (g.liberties.size === 0) {
          for (const [sx, sy] of g.stones) {
            this.board[sy][sx] = EMPTY;
            capturedStones.push([sx, sy]);
          }
        }
      }
    }

    this.captures[color] += capturedStones.length;
    this.koPoint = null;
    if (this.playerCount === 2 && capturedStones.length === 1) {
      const ownGroup = this.getGroup(this.board, x, y);
      if (ownGroup.stones.length === 1 && ownGroup.liberties.size === 1) {
        this.koPoint = { x: capturedStones[0][0], y: capturedStones[0][1] };
      }
    }

    this.lastMove = { x, y };
    this.consecutivePasses = 0;
    const nextPlayer = this.nextActivePlayer(color);
    const positionKey = this.positionKey(this.board);
    const turnKey = `${positionKey}|${nextPlayer}`;
    this.positionHistory.push(positionKey);
    this.positionHistorySet.add(positionKey);
    this.turnPositionHistory.push(turnKey);
    const repeatCount = (this.turnPositionCounts.get(turnKey) ?? 0) + 1;
    this.turnPositionCounts.set(turnKey, repeatCount);
    this.currentPlayer = nextPlayer;

    // Japanese rules: triple ko / eternal life (3x exact board+turn cycle) ends as no result (tie)
    if (this.playerCount === 2 && repeatCount >= 3) {
      this.gameOver = true;
      this.winner = null;
      return {
        success: true,
        captured: capturedStones.length,
        gameOver: true,
        reason: 'TRIPLE_KO_NO_RESULT',
      };
    }

    return { success: true, captured: capturedStones.length };
  }

  public pass(): MoveResult {
    if (this.gameOver) return { success: false, captured: 0, reason: 'GAME_OVER' };

    this.history.push({
      board: this.board.map((r) => r.slice()),
      captures: { ...this.captures },
      player: this.currentPlayer,
      koPoint: this.koPoint,
      lastMove: this.lastMove,
      consecutivePasses: this.consecutivePasses,
      eliminatedPlayers: Array.from(this.eliminatedPlayers),
      positionHistoryLength: this.positionHistory.length,
    });

    this.consecutivePasses++;
    this.koPoint = null;
    this.lastMove = null;
    this.currentPlayer = this.nextActivePlayer(this.currentPlayer);

    if (this.consecutivePasses >= this.getRemainingPlayersCount()) {
      this.gameOver = true;
      return { success: true, captured: 0, gameOver: true };
    }

    return { success: true, captured: 0 };
  }

  public resignCurrentPlayer(): { gameOver: boolean; winner: PlayerColor | null } {
    if (this.gameOver) return { gameOver: true, winner: this.winner };
    const resigner = this.currentPlayer;
    this.eliminatedPlayers.add(resigner);

    const remaining = this.getActivePlayersList().filter(
      (p) => !this.eliminatedPlayers.has(p)
    );

    if (remaining.length <= 1) {
      this.gameOver = true;
      this.winner = remaining[0] ?? null;
      return { gameOver: true, winner: this.winner };
    }

    this.koPoint = null;
    this.consecutivePasses = 0;
    this.currentPlayer = this.nextActivePlayer(resigner);
    return { gameOver: false, winner: null };
  }

  public undo(): boolean {
    if (this.history.length === 0) return false;
    const prev = this.history.pop()!;
    this.board = prev.board;
    this.captures = prev.captures;
    this.currentPlayer = prev.player;
    this.koPoint = prev.koPoint;
    this.lastMove = prev.lastMove;
    this.consecutivePasses = prev.consecutivePasses;
    this.eliminatedPlayers = new Set(prev.eliminatedPlayers);
    const keepLength = prev.positionHistoryLength ?? this.positionHistory.length;
    while (this.positionHistory.length > keepLength) {
      const removed = this.positionHistory.pop();
      if (removed !== undefined) {
        this.positionHistorySet.delete(removed);
      }
    }
    while (this.turnPositionHistory.length > keepLength) {
      const removedTurn = this.turnPositionHistory.pop();
      if (removedTurn !== undefined) {
        const cur = this.turnPositionCounts.get(removedTurn) ?? 0;
        if (cur <= 1) this.turnPositionCounts.delete(removedTurn);
        else this.turnPositionCounts.set(removedTurn, cur - 1);
      }
    }
    this.gameOver = false;
    this.winner = null;
    return true;
  }

  public scoreGame(komi = 6.5): ScoreResult {
    const w = this.width;
    const h = this.height;
    const visited = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
    const territoryOwner: CellValue[][] = Array.from({ length: h }, () =>
      new Array<CellValue>(w).fill(EMPTY)
    );

    const territory: Record<PlayerColor, number> = {
      [WHITE]: 0,
      [RED]: 0,
      [GOLD]: 0,
      [VIOLET]: 0,
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.board[y][x] !== EMPTY || visited[y][x]) continue;
        const region: [number, number][] = [];
        const borders = new Set<PlayerColor>();
        const stack: [number, number][] = [[x, y]];
        visited[y][x] = true;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          region.push([cx, cy]);
          for (const [nx, ny] of this.neighbors(cx, cy)) {
            const cell = this.board[ny][nx];
            if (cell !== EMPTY) {
              borders.add(cell);
            } else if (!visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }

        if (borders.size === 1) {
          const owner = borders.values().next().value!;
          for (const [rx, ry] of region) {
            territoryOwner[ry][rx] = owner;
          }
        }
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const owner = territoryOwner[y][x];
        if (owner !== EMPTY) territory[owner]++;
      }
    }

    const komiByPlayer = computeKomiMap(this.playerCount, komi);
    const active = this.getActivePlayersList();
    const scores: Record<PlayerColor, number> = {
      [WHITE]: 0,
      [RED]: 0,
      [GOLD]: 0,
      [VIOLET]: 0,
    };

    let bestScore = -Infinity;
    for (const p of active) {
      // Japanese Territory Scoring: surrounded territory + captured prisoners + komi
      scores[p] = territory[p] + this.captures[p] + komiByPlayer[p];
      if (!this.eliminatedPlayers.has(p) && scores[p] > bestScore) {
        bestScore = scores[p];
      }
    }

    const tiedWinners = active.filter(
      (p) => !this.eliminatedPlayers.has(p) && Math.abs(scores[p] - bestScore) < 1e-6
    );
    const winner = tiedWinners.length === 1 ? tiedWinners[0] : null;

    return {
      territory,
      komiByPlayer,
      scores,
      winner,
      territoryOwner,
    };
  }
}
