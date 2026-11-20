// SPDX-License-Identifier: AGPL-3.0-or-later

import { CellValue, EMPTY, mod, PlayerColor } from './torusGo';

interface LifeStepResult {
  nextBoard: CellValue[][];
  changed: boolean;
}

export function cloneBoardForLife(board: CellValue[][]): CellValue[][] {
  return board.map((row) => [...row]);
}

const MOORE_OFFSETS: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Conway's Game of Life (B3/S23) on a toroidal grid.
 * Preserves multi-player stone colors:
 * - Surviving cells keep their existing color.
 * - Newly born cells (exactly 3 live neighbors) inherit the plurality parent color,
 *   breaking 3-way ties deterministically across the 3 parent colors.
 */
export function stepToroidalLife(board: CellValue[][], generation: number): LifeStepResult {
  const height = board.length;
  const width = height > 0 ? board[0].length : 0;
  const nextBoard: CellValue[][] = Array.from({ length: height }, () =>
    Array<CellValue>(width).fill(EMPTY)
  );

  let changed = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const current = board[y][x];
      let liveNeighbors = 0;
      const parents: PlayerColor[] = [];

      for (let i = 0; i < MOORE_OFFSETS.length; i++) {
        const nx = mod(x + MOORE_OFFSETS[i][0], width);
        const ny = mod(y + MOORE_OFFSETS[i][1], height);
        const neighbor = board[ny][nx];
        if (neighbor !== EMPTY) {
          liveNeighbors++;
          if (current === EMPTY && parents.length < 4) {
            parents.push(neighbor);
          }
        }
      }

      let nextCell: CellValue = EMPTY;
      if (current !== EMPTY) {
        if (liveNeighbors === 2 || liveNeighbors === 3) {
          nextCell = current;
        }
      } else if (liveNeighbors === 3 && parents.length === 3) {
        const [a, b, c] = parents;
        if (a === b || a === c) {
          nextCell = a;
        } else if (b === c) {
          nextCell = b;
        } else {
          nextCell = parents[(x + y + generation) % 3];
        }
      }

      nextBoard[y][x] = nextCell;
      if (nextCell !== current) changed = true;
    }
  }

  return { nextBoard, changed };
}
