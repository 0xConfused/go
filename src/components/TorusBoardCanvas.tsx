// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ALL_PLAYERS,
  CellValue,
  EMPTY,
  GameMode,
  GO_COLUMNS,
  GoGame,
  mod,
  PLAYER_META,
  PlayerColor,
  ScoreResult,
} from '../engine/torusGo';

interface TorusBoardCanvasProps {
  game: GoGame;
  renderVersion: number;
  mode: GameMode;
  setupColor: CellValue;
  showTerritory: boolean;
  lastScoreResult: ScoreResult | null;
  atariStones: Set<number>;
  aiThinking: boolean;
  cameraX: number;
  cameraY: number;
  zoomLevel: number;
  onCameraChange: (x: number, y: number) => void;
  onZoomChange: (zoom: number, newCamX?: number, newCamY?: number) => void;
  onBoardClick: (bx: number, by: number) => void;
  onResetZoom: () => void;
  onCenterView: () => void;
  onSetSetupColor: (color: CellValue) => void;
  lifeBoard: CellValue[][] | null;
  lifeGeneration: number;
}

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.07;
const ZOOM_STEP = 1.12;
const PAN_THRESHOLD = 4;

function axisStarCoords(dim: number): number[] {
  if (dim < 7) return [];
  if (dim < 12) {
    return dim % 2 === 1 ? [2, Math.floor(dim / 2), dim - 3] : [2, dim - 3];
  }
  return dim % 2 === 1 ? [3, Math.floor(dim / 2), dim - 4] : [3, dim - 4];
}

function getStarPoints(width: number, height: number): Set<number> {
  const pts = new Set<number>();
  const xs = axisStarCoords(width);
  const ys = axisStarCoords(height);
  for (const y of ys) {
    for (const x of xs) {
      pts.add(y * width + x);
    }
  }
  return pts;
}

function virtualMatches(bx: number, period: number, min: number, max: number): number[] {
  const result: number[] = [];
  const start = min + mod(bx - min, period);
  for (let v = start; v <= max; v += period) {
    result.push(v);
  }
  return result;
}

export const TorusBoardCanvas: React.FC<TorusBoardCanvasProps> = ({
  game,
  renderVersion,
  mode,
  setupColor,
  showTerritory,
  lastScoreResult,
  atariStones,
  aiThinking,
  cameraX,
  cameraY,
  zoomLevel,
  onCameraChange,
  onZoomChange,
  onBoardClick,
  onResetZoom,
  onCenterView,
  onSetSetupColor,
  lifeBoard,
  lifeGeneration,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [hoverVirtual, setHoverVirtual] = useState<{ vx: number; vy: number } | null>(null);
  const [isPanningUI, setIsPanningUI] = useState(false);

  const flashPhaseRef = useRef<number>(0);
  const isPanningRef = useRef<boolean>(false);
  const hasPannedRef = useRef<boolean>(false);
  const panStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartCamRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  const stateRef = useRef({
    game,
    mode,
    setupColor,
    showTerritory,
    lastScoreResult,
    atariStones,
    aiThinking,
    cameraX,
    cameraY,
    zoomLevel,
    hoverVirtual,
    lifeBoard,
  });

  stateRef.current = {
    game,
    mode,
    setupColor,
    showTerritory,
    lastScoreResult,
    atariStones,
    aiThinking,
    cameraX,
    cameraY,
    zoomLevel,
    hoverVirtual,
    lifeBoard,
  };

  useEffect(() => {
    if (aiThinking && isPanningRef.current) {
      isPanningRef.current = false;
      hasPannedRef.current = false;
      touchIdRef.current = null;
      setIsPanningUI(false);
    }
  }, [aiThinking]);

  const getMetrics = useCallback(
    (canvasWidth: number, canvasHeight: number, boardW: number, boardH: number, zoom: number) => {
      const baseCellSize = Math.min(
        canvasWidth / (boardW + 2),
        canvasHeight / (boardH + 2)
      );
      const cellSize = baseCellSize * zoom;
      return { boardW, boardH, cellSize };
    },
    []
  );

  const virtualToPixel = useCallback(
    (
      vx: number,
      vy: number,
      canvasW: number,
      canvasH: number,
      camX: number,
      camY: number,
      cellSize: number
    ) => ({
      px: canvasW / 2 + (vx - camX) * cellSize,
      py: canvasH / 2 + (vy - camY) * cellSize,
    }),
    []
  );

  const pixelToVirtual = useCallback(
    (
      px: number,
      py: number,
      canvasW: number,
      canvasH: number,
      camX: number,
      camY: number,
      cellSize: number
    ) => ({
      vx: (px - canvasW / 2) / cellSize + camX,
      vy: (py - canvasH / 2) / cellSize + camY,
    }),
    []
  );

  const drawBoard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const canvasW = canvas.width / dpr;
    const canvasH = canvas.height / dpr;
    if (canvasW <= 0 || canvasH <= 0) return;

    const {
      game: g,
      mode: currentMode,
      setupColor: brush,
      showTerritory: showTerr,
      lastScoreResult: scoreRes,
      atariStones: atariSet,
      cameraX: camX,
      cameraY: camY,
      zoomLevel: zoom,
      hoverVirtual: hover,
      lifeBoard: lifeB,
    } = stateRef.current;

    const { boardW, boardH, cellSize } = getMetrics(
      canvasW,
      canvasH,
      g.width,
      g.height,
      zoom
    );

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dark carbon goban canvas
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const topLeft = pixelToVirtual(0, 0, canvasW, canvasH, camX, camY, cellSize);
    const bottomRight = pixelToVirtual(
      canvasW,
      canvasH,
      canvasW,
      canvasH,
      camX,
      camY,
      cellSize
    );
    const minVX = Math.floor(topLeft.vx) - 1;
    const maxVX = Math.ceil(bottomRight.vx) + 1;
    const minVY = Math.floor(topLeft.vy) - 1;
    const maxVY = Math.ceil(bottomRight.vy) + 1;

    // Closest board tile to the viewport center
    const tileX = Math.round((camX - (boardW - 1) / 2) / boardW);
    const tileY = Math.round((camY - (boardH - 1) / 2) / boardH);
    const baseVx = tileX * boardW;
    const baseVy = tileY * boardH;

    // Subtle highlight on the closest board tile to the center
    const pOrigin0 = virtualToPixel(
      baseVx - 0.5,
      baseVy - 0.5,
      canvasW,
      canvasH,
      camX,
      camY,
      cellSize
    );
    const pOrigin1 = virtualToPixel(
      baseVx + boardW - 0.5,
      baseVy + boardH - 0.5,
      canvasW,
      canvasH,
      camX,
      camY,
      cellSize
    );
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(pOrigin0.px, pOrigin0.py, pOrigin1.px - pOrigin0.px, pOrigin1.py - pOrigin0.py);

    // Standard grid lines
    ctx.strokeStyle = 'rgba(107, 102, 90, 0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let vx = minVX; vx <= maxVX; vx++) {
      const p1 = virtualToPixel(vx, minVY, canvasW, canvasH, camX, camY, cellSize);
      const p2 = virtualToPixel(vx, maxVY, canvasW, canvasH, camX, camY, cellSize);
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
    }
    for (let vy = minVY; vy <= maxVY; vy++) {
      const p1 = virtualToPixel(minVX, vy, canvasW, canvasH, camX, camY, cellSize);
      const p2 = virtualToPixel(maxVX, vy, canvasW, canvasH, camX, camY, cellSize);
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
    }
    ctx.stroke();

    // Torus period boundary hairlines every `boardW` (X) and `boardH` (Y) cells
    ctx.strokeStyle = 'rgba(195, 8, 0, 0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const firstTileX = Math.floor((minVX + 0.5) / boardW) * boardW - 0.5;
    for (let tx = firstTileX; tx <= maxVX + 0.5; tx += boardW) {
      const p1 = virtualToPixel(tx, minVY, canvasW, canvasH, camX, camY, cellSize);
      const p2 = virtualToPixel(tx, maxVY, canvasW, canvasH, camX, camY, cellSize);
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
    }
    const firstTileY = Math.floor((minVY + 0.5) / boardH) * boardH - 0.5;
    for (let ty = firstTileY; ty <= maxVY + 0.5; ty += boardH) {
      const p1 = virtualToPixel(minVX, ty, canvasW, canvasH, camX, camY, cellSize);
      const p2 = virtualToPixel(maxVX, ty, canvasW, canvasH, camX, camY, cellSize);
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Sharp square star/hoshi points
    const starPoints = getStarPoints(boardW, boardH);
    if (starPoints.size > 0 && cellSize >= 10) {
      ctx.fillStyle = 'rgba(140, 140, 140, 0.5)';
      const starSize = Math.max(3, Math.min(5, cellSize * 0.14));
      for (let vy = minVY; vy <= maxVY; vy++) {
        const by = mod(vy, boardH);
        for (let vx = minVX; vx <= maxVX; vx++) {
          const bx = mod(vx, boardW);
          if (starPoints.has(by * boardW + bx)) {
            const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
            ctx.fillRect(p.px - starSize / 2, p.py - starSize / 2, starSize, starSize);
          }
        }
      }
    }

    // Space chart (coordinate labels) anchored on the closest board tile to the viewport center
    if (cellSize >= 12) {
      ctx.fillStyle = 'rgba(240, 240, 240, 0.65)';
      ctx.font = `600 ${Math.min(11, Math.max(8, Math.floor(cellSize * 0.3)))}px "Fira Code", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let x = 0; x < boardW; x++) {
        const p = virtualToPixel(
          baseVx + x,
          baseVy - 0.74,
          canvasW,
          canvasH,
          camX,
          camY,
          cellSize
        );
        if (p.px > 12 && p.px < canvasW - 12 && p.py > 12 && p.py < canvasH - 12) {
          ctx.fillText(GO_COLUMNS[x] || '', p.px, p.py);
        }
      }
      ctx.textAlign = 'right';
      for (let y = 0; y < boardH; y++) {
        const p = virtualToPixel(
          baseVx - 0.7,
          baseVy + y,
          canvasW,
          canvasH,
          camX,
          camY,
          cellSize
        );
        if (p.px > 16 && p.px < canvasW - 12 && p.py > 12 && p.py < canvasH - 12) {
          ctx.fillText(String(boardH - y), p.px, p.py);
        }
      }
    }

    // Territory ownership overlay
    if (showTerr && scoreRes && !lifeB) {
      for (let vx = minVX; vx <= maxVX; vx++) {
        const bx = mod(vx, boardW);
        for (let vy = minVY; vy <= maxVY; vy++) {
          const by = mod(vy, boardH);
          const owner = scoreRes.territoryOwner[by]?.[bx] ?? EMPTY;
          if (owner !== EMPTY && g.board[by][bx] === EMPTY) {
            const meta = PLAYER_META[owner];
            const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
            ctx.fillStyle = meta.territoryFill;
            const s = cellSize * 0.28;
            ctx.fillRect(p.px - s, p.py - s, s * 2, s * 2);
            ctx.strokeStyle = meta.territoryStroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(p.px - s, p.py - s, s * 2, s * 2);
          }
        }
      }
    }

    const drawStoneAt = (
      vx: number,
      vy: number,
      color: CellValue,
      alpha: number,
      isAtari: boolean
    ) => {
      if (color === EMPTY) return;
      const meta = PLAYER_META[color];
      const { px, py } = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
      const r = cellSize * 0.42;
      ctx.save();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2.5, r, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(
        px - r * 0.34,
        py - r * 0.38,
        r * 0.08,
        px,
        py,
        r * 1.08
      );
      grad.addColorStop(0, meta.stoneGradient[0]);
      grad.addColorStop(0.62, meta.stoneGradient[1]);
      grad.addColorStop(1, meta.stoneGradient[2]);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = meta.stoneBorder;
      ctx.lineWidth = Math.max(0.75, cellSize * 0.015);
      ctx.stroke();

      if (isAtari) {
        const t = 0.5 - 0.5 * Math.cos(flashPhaseRef.current * Math.PI * 2);
        const outlineAlpha = 0.45 + t * 0.55;
        ctx.strokeStyle = `rgba(195, 0, 90, ${outlineAlpha})`;
        ctx.lineWidth = Math.max(1.25, cellSize * 0.055);
        const pad = cellSize * 0.08;
        ctx.beginPath();
        ctx.moveTo(px, py - r - pad);
        ctx.lineTo(px + r + pad, py);
        ctx.lineTo(px, py + r + pad);
        ctx.lineTo(px - r - pad, py);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.restore();
    };

    // Draw stones across visible tiled coordinates
    const activeBoard = lifeB ?? g.board;
    for (let vy = minVY; vy <= maxVY; vy++) {
      const by = mod(vy, boardH);
      for (let vx = minVX; vx <= maxVX; vx++) {
        const bx = mod(vx, boardW);
        const c = activeBoard[by]?.[bx] ?? EMPTY;
        if (c !== EMPTY) {
          const key = by * boardW + bx;
          const inAtari = !lifeB && atariSet.has(key);
          drawStoneAt(vx, vy, c, 1.0, inAtari && currentMode !== 'setup');
        }
      }
    }

    // Last move diamond marker
    if (g.lastMove && currentMode !== 'setup' && !lifeB) {
      const lx = g.lastMove.x;
      const ly = g.lastMove.y;
      const c = g.board[ly]?.[lx] ?? EMPTY;
      if (c !== EMPTY) {
        ctx.fillStyle = PLAYER_META[c].markerFill;
        for (const vx of virtualMatches(lx, boardW, minVX, maxVX)) {
          for (const vy of virtualMatches(ly, boardH, minVY, maxVY)) {
            const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
            const s = cellSize * 0.13;
            ctx.beginPath();
            ctx.moveTo(p.px, p.py - s);
            ctx.lineTo(p.px + s, p.py);
            ctx.lineTo(p.px, p.py + s);
            ctx.lineTo(p.px - s, p.py);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // Hover preview / illegal X
    if (hover && !g.gameOver) {
      const { vx, vy } = hover;
      const bx = mod(vx, boardW);
      const by = mod(vy, boardH);

      if (currentMode === 'setup') {
        if (brush === EMPTY) {
          if (g.board[by][bx] !== EMPTY) {
            const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
            ctx.strokeStyle = '#c3005a';
            ctx.lineWidth = 2;
            const s = cellSize * 0.28;
            ctx.beginPath();
            ctx.moveTo(p.px - s, p.py - s);
            ctx.lineTo(p.px + s, p.py + s);
            ctx.moveTo(p.px + s, p.py - s);
            ctx.lineTo(p.px - s, p.py + s);
            ctx.stroke();
          }
        } else if (g.board[by][bx] === EMPTY) {
          drawStoneAt(vx, vy, brush, 0.42, false);
        } else if (g.board[by][bx] !== brush) {
          const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
          ctx.strokeStyle = '#c36a00';
          ctx.lineWidth = 1.5;
          const s = cellSize * 0.3;
          ctx.strokeRect(p.px - s, p.py - s, s * 2, s * 2);
        }
      } else if (g.board[by][bx] === EMPTY) {
        const check = g.isLegalMove(bx, by, g.currentPlayer);
        drawStoneAt(vx, vy, g.currentPlayer, check.legal ? 0.42 : 0.2, false);
        if (!check.legal) {
          const p = virtualToPixel(vx, vy, canvasW, canvasH, camX, camY, cellSize);
          ctx.strokeStyle = '#c3005a';
          ctx.lineWidth = 2;
          const s = cellSize * 0.28;
          ctx.beginPath();
          ctx.moveTo(p.px - s, p.py - s);
          ctx.lineTo(p.px + s, p.py + s);
          ctx.moveTo(p.px + s, p.py - s);
          ctx.lineTo(p.px - s, p.py + s);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }, [getMetrics, pixelToVirtual, virtualToPixel]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      drawBoard();
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [drawBoard]);

  useEffect(() => {
    drawBoard();
  }, [
    renderVersion,
    mode,
    setupColor,
    showTerritory,
    lastScoreResult,
    atariStones,
    cameraX,
    cameraY,
    zoomLevel,
    hoverVirtual,
    lifeBoard,
    drawBoard,
  ]);

  useEffect(() => {
    if (mode === 'setup' || atariStones.size === 0) return;

    let rafId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      flashPhaseRef.current = (flashPhaseRef.current + dt * 1.2) % 1;
      drawBoard();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [mode, atariStones, drawBoard]);

  const zoomAtPixel = useCallback(
    (pixelX: number, pixelY: number, factor: number) => {
      if (stateRef.current.aiThinking) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;

      const { zoomLevel: curZoom, cameraX: curCamX, cameraY: curCamY, game: g } = stateRef.current;
      const { cellSize } = getMetrics(canvasW, canvasH, g.width, g.height, curZoom);
      const vBefore = pixelToVirtual(
        pixelX,
        pixelY,
        canvasW,
        canvasH,
        curCamX,
        curCamY,
        cellSize
      );

      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, curZoom * factor));
      if (newZoom === curZoom) return;

      const { cellSize: newCellSize } = getMetrics(
        canvasW,
        canvasH,
        g.width,
        g.height,
        newZoom
      );
      const newCamX = vBefore.vx - (pixelX - canvasW / 2) / newCellSize;
      const newCamY = vBefore.vy - (pixelY - canvasH / 2) / newCellSize;
      onZoomChange(newZoom, newCamX, newCamY);
    },
    [getMetrics, onZoomChange, pixelToVirtual]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (stateRef.current.aiThinking) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      let delta = e.deltaY;
      if (e.deltaMode === e.DOM_DELTA_LINE) delta *= 40;
      else if (e.deltaMode === e.DOM_DELTA_PAGE) delta *= 800;
      const factor = Math.pow(ZOOM_STEP, -delta / 100);
      zoomAtPixel(px, py, factor);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [zoomAtPixel]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;

      if (isPanningRef.current) {
        if (stateRef.current.aiThinking) {
          isPanningRef.current = false;
          setIsPanningUI(false);
          return;
        }
        const dx = e.clientX - panStartMouseRef.current.x;
        const dy = e.clientY - panStartMouseRef.current.y;
        if (
          !hasPannedRef.current &&
          (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD)
        ) {
          hasPannedRef.current = true;
        }
        if (hasPannedRef.current) {
          const { cellSize } = getMetrics(
            canvasW,
            canvasH,
            stateRef.current.game.width,
            stateRef.current.game.height,
            stateRef.current.zoomLevel
          );
          onCameraChange(
            panStartCamRef.current.x - dx / cellSize,
            panStartCamRef.current.y - dy / cellSize
          );
        }
      } else if (e.target === canvas) {
        const { cellSize } = getMetrics(
          canvasW,
          canvasH,
          stateRef.current.game.width,
          stateRef.current.game.height,
          stateRef.current.zoomLevel
        );
        const v = pixelToVirtual(
          px,
          py,
          canvasW,
          canvasH,
          stateRef.current.cameraX,
          stateRef.current.cameraY,
          cellSize
        );
        const vx = Math.round(v.vx);
        const vy = Math.round(v.vy);
        const p = virtualToPixel(
          vx,
          vy,
          canvasW,
          canvasH,
          stateRef.current.cameraX,
          stateRef.current.cameraY,
          cellSize
        );
        const dist = Math.hypot(px - p.px, py - p.py);
        if (dist <= cellSize * 0.45) {
          setHoverVirtual((prev) => (prev && prev.vx === vx && prev.vy === vy ? prev : { vx, vy }));
        } else {
          setHoverVirtual((prev) => (prev ? null : prev));
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      setIsPanningUI(false);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const { game: g, mode: curMode, aiThinking: thinking } = stateRef.current;
      if (thinking || hasPannedRef.current || (g.gameOver && curMode !== 'setup')) return;

      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;

      const { cellSize } = getMetrics(
        canvasW,
        canvasH,
        g.width,
        g.height,
        stateRef.current.zoomLevel
      );
      const v = pixelToVirtual(
        px,
        py,
        canvasW,
        canvasH,
        stateRef.current.cameraX,
        stateRef.current.cameraY,
        cellSize
      );
      const vx = Math.round(v.vx);
      const vy = Math.round(v.vy);
      const bx = mod(vx, g.width);
      const by = mod(vy, g.height);
      onBoardClick(bx, by);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getMetrics, onBoardClick, onCameraChange, pixelToVirtual, virtualToPixel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (stateRef.current.aiThinking) return;

      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas ? canvas.width / dpr : 600;
      const canvasH = canvas ? canvas.height / dpr : 600;

      let handled = false;
      const maxP = stateRef.current.game.playerCount;
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          onCameraChange(stateRef.current.cameraX - 1, stateRef.current.cameraY);
          handled = true;
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          onCameraChange(stateRef.current.cameraX + 1, stateRef.current.cameraY);
          handled = true;
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          onCameraChange(stateRef.current.cameraX, stateRef.current.cameraY - 1);
          handled = true;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          onCameraChange(stateRef.current.cameraX, stateRef.current.cameraY + 1);
          handled = true;
          break;
        case '+':
        case '=':
          zoomAtPixel(canvasW / 2, canvasH / 2, ZOOM_STEP);
          handled = true;
          break;
        case '-':
        case '_':
          zoomAtPixel(canvasW / 2, canvasH / 2, 1 / ZOOM_STEP);
          handled = true;
          break;
        case '0':
          onResetZoom();
          handled = true;
          break;
        case 'c':
        case 'C':
          onCenterView();
          handled = true;
          break;
        case '1':
        case '2':
        case '3':
        case '4': {
          if (stateRef.current.mode === 'setup') {
            const idx = Number(e.key) - 1;
            if (idx < maxP) {
              onSetSetupColor(ALL_PLAYERS[idx]);
              handled = true;
            }
          }
          break;
        }
        case 'e':
        case 'E':
          if (stateRef.current.mode === 'setup') {
            onSetSetupColor(EMPTY);
            handled = true;
          }
          break;
      }

      if (handled) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCameraChange, onCenterView, onResetZoom, onSetSetupColor, zoomAtPixel]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || aiThinking) return;
    isPanningRef.current = true;
    hasPannedRef.current = false;
    setIsPanningUI(true);
    panStartMouseRef.current = { x: e.clientX, y: e.clientY };
    panStartCamRef.current = { x: cameraX, y: cameraY };
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (aiThinking || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchIdRef.current = t.identifier;
    isPanningRef.current = true;
    hasPannedRef.current = false;
    setIsPanningUI(true);
    panStartMouseRef.current = { x: t.clientX, y: t.clientY };
    panStartCamRef.current = { x: cameraX, y: cameraY };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPanningRef.current) return;
    if (aiThinking) {
      isPanningRef.current = false;
      setIsPanningUI(false);
      return;
    }
    let t: React.Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === touchIdRef.current) {
        t = e.touches[i];
        break;
      }
    }
    if (!t) return;

    const dx = t.clientX - panStartMouseRef.current.x;
    const dy = t.clientY - panStartMouseRef.current.y;
    if (
      !hasPannedRef.current &&
      (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD)
    ) {
      hasPannedRef.current = true;
    }
    if (hasPannedRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const canvasW = canvas.width / dpr;
      const canvasH = canvas.height / dpr;
      const { cellSize } = getMetrics(canvasW, canvasH, game.width, game.height, zoomLevel);
      onCameraChange(panStartCamRef.current.x - dx / cellSize, panStartCamRef.current.y - dy / cellSize);
    }
  };

  const handleTouchEnd = () => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    setIsPanningUI(false);

    if (aiThinking || hasPannedRef.current || (game.gameOver && mode !== 'setup')) {
      touchIdRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      touchIdRef.current = null;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const px = panStartMouseRef.current.x - rect.left;
    const py = panStartMouseRef.current.y - rect.top;
    const dpr = window.devicePixelRatio || 1;
    const canvasW = canvas.width / dpr;
    const canvasH = canvas.height / dpr;
    const { cellSize } = getMetrics(canvasW, canvasH, game.width, game.height, zoomLevel);
    const v = pixelToVirtual(px, py, canvasW, canvasH, cameraX, cameraY, cellSize);
    const vx = Math.round(v.vx);
    const vy = Math.round(v.vy);
    const bx = mod(vx, game.width);
    const by = mod(vy, game.height);
    onBoardClick(bx, by);
    touchIdRef.current = null;
  };

  const setupBrushLabel =
    setupColor === EMPTY ? 'ERASE' : PLAYER_META[setupColor as PlayerColor].name;

  const cursorClass = aiThinking
    ? 'cursor-wait'
    : isPanningUI
    ? 'cursor-grabbing'
    : lifeBoard !== null
    ? 'cursor-grab'
    : game.gameOver && mode !== 'setup'
    ? 'cursor-not-allowed'
    : mode === 'setup'
    ? 'cursor-crosshair'
    : 'cursor-grab';

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center overflow-hidden bg-[#0d0d0d]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(195, 8, 0, 0.05) 0%, transparent 60%)',
        }}
      />

      {/* Top-right clickable zoom indicator */}
      <button
        type="button"
        onClick={onResetZoom}
        disabled={aiThinking}
        title="Reset zoom to 100% and center on closest board"
        aria-label="Reset zoom to 100% and center on closest board"
        className="absolute z-10 top-3 right-3 px-2.5 py-1.5 bg-[#141414]/90 hover:bg-[#262626] border border-[#383838] hover:border-[#c30800] disabled:opacity-50 disabled:cursor-wait font-mono text-[11px] text-[#8c8c8c] hover:text-[#f0f0f0] font-bold tabular-nums backdrop-blur-sm transition-colors cursor-pointer"
      >
        ZOOM: {Math.round(zoomLevel * 100)}%
      </button>

      <canvas
        ref={canvasRef}
        aria-label="Toroidal Go board. Click an intersection to place a stone; drag to pan and scroll to zoom."
        className={`relative z-0 block touch-none select-none ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseLeave={() => setHoverVirtual(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Bottom interaction hint */}
      <div className="pointer-events-none absolute z-10 bottom-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-24px)] px-3 py-1.5 bg-[#141414]/90 border border-[#383838] font-mono text-[10px] text-[#8c8c8c] tracking-wider whitespace-nowrap truncate backdrop-blur-sm">
        {aiThinking
          ? 'AI THINKING · PANNING PAUSED'
          : lifeBoard !== null
          ? `GAME OF LIFE · GEN #${lifeGeneration} · [DRAG] PAN · [SCROLL] ZOOM · [C] CENTER`
          : mode === 'setup'
          ? `SETUP BRUSH: ${setupBrushLabel} · [1-${game.playerCount}] STONE · [E] ERASE · [CLICK] EDIT`
          : '[DRAG] PAN · [SCROLL] ZOOM · [CLICK] PLACE · [ARROWS] NAVIGATE · [C] CENTER'}
      </div>
    </div>
  );
};
