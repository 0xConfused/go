// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  CellValue,
  clampBoardDim,
  colorName,
  coordToLabel,
  EMPTY,
  GameMode,
  getActivePlayers,
  GoGame,
  PlayerColor,
  PlayerCount,
  ScoreResult,
  WHITE,
} from './engine/torusGo';
import { cloneBoardForLife, stepToroidalLife } from './engine/gameOfLife';
import { PachiInspiredTorusAI } from './engine/torusAi';
import { TorusGoHeader } from './components/TorusGoHeader';
import { MinimalBoardControls } from './components/MinimalBoardControls';
import { TorusBoardCanvas } from './components/TorusBoardCanvas';
import { WinnerPopup } from './components/WinnerPopup';
import { SiteFooter } from './components/SiteFooter';

const DEFAULT_WIDTH = 19;
const DEFAULT_HEIGHT = 19;
const DEFAULT_PLAYERS: PlayerCount = 2;
const DEFAULT_KOMI = 6.5;

export default function App() {
  const gameRef = useRef<GoGame>(new GoGame(DEFAULT_WIDTH, DEFAULT_HEIGHT, DEFAULT_PLAYERS));
  const [renderVersion, setRenderVersion] = useState(0);

  const [boardWidth, setBoardWidth] = useState<number>(DEFAULT_WIDTH);
  const [boardHeight, setBoardHeight] = useState<number>(DEFAULT_HEIGHT);
  const [pendingWidth, setPendingWidth] = useState<number>(DEFAULT_WIDTH);
  const [pendingHeight, setPendingHeight] = useState<number>(DEFAULT_HEIGHT);
  const [playerCount, setPlayerCount] = useState<PlayerCount>(DEFAULT_PLAYERS);
  const [pendingPlayerCount, setPendingPlayerCount] = useState<PlayerCount>(DEFAULT_PLAYERS);

  const [komi, setKomi] = useState<number>(DEFAULT_KOMI);
  const [mode, setMode] = useState<GameMode>('play');
  const [setupColor, setSetupColor] = useState<CellValue>(WHITE);
  const [setupNextPlayer, setSetupNextPlayer] = useState<PlayerColor>(WHITE);

  const [aiPlayers, setAiPlayers] = useState<Set<PlayerColor>>(() => new Set());
  const [aiThinking, setAiThinking] = useState(false);

  const [showTerritory, setShowTerritory] = useState(false);
  const [lastScoreResult, setLastScoreResult] = useState<ScoreResult | null>(null);
  const [atariStones, setAtariStones] = useState<Set<number>>(() => new Set());

  const [cameraX, setCameraX] = useState<number>((DEFAULT_WIDTH - 1) / 2);
  const [cameraY, setCameraY] = useState<number>((DEFAULT_HEIGHT - 1) / 2);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  const [panelOpen, setPanelOpen] = useState<boolean>(false);

  const [lifeState, setLifeState] = useState<{ board: CellValue[][]; generation: number } | null>(
    null
  );

  const [statusMessage, setStatusMessage] = useState<string>('White to move.');

  const aiRequestTokenRef = useRef<number>(0);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stateMirrorRef = useRef({
    komi,
    mode,
    aiPlayers,
    aiThinking,
  });
  stateMirrorRef.current = { komi, mode, aiPlayers, aiThinking };

  const bumpRender = useCallback(() => {
    setRenderVersion((v) => v + 1);
  }, []);

  const refreshAtari = useCallback((currentMode: GameMode) => {
    if (currentMode === 'setup') {
      setAtariStones(new Set());
    } else {
      setAtariStones(gameRef.current.findAtariStoneKeys());
    }
  }, []);

  const cancelPendingAI = useCallback(() => {
    aiRequestTokenRef.current++;
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    setAiThinking(false);
  }, []);

  const startGameOfLife = useCallback((board: CellValue[][]) => {
    setLifeState({
      board: cloneBoardForLife(board),
      generation: 0,
    });
  }, []);

  const stopGameOfLife = useCallback(() => {
    setLifeState(null);
  }, []);

  useEffect(() => {
    if (!lifeState || mode !== 'play') return;
    const timer = setInterval(() => {
      setLifeState((prev) => {
        if (!prev) return prev;
        const res = stepToroidalLife(prev.board, prev.generation);
        if (!res.changed) return prev;
        return {
          board: res.nextBoard,
          generation: prev.generation + 1,
        };
      });
    }, 560);
    return () => clearInterval(timer);
  }, [lifeState !== null, mode]);

  const doScore = useCallback(
    (komiOverride?: number) => {
      const g = gameRef.current;
      const activeKomi = komiOverride ?? stateMirrorRef.current.komi;
      const result = g.scoreGame(activeKomi);
      g.gameOver = true;
      g.winner = result.winner;
      setLastScoreResult(result);
      setShowTerritory(false);
      setAtariStones(new Set());
      startGameOfLife(g.board);

      const summary = g
        .getActivePlayersList()
        .map((p) => `${colorName(p)} ${result.scores[p].toFixed(1)}`)
        .join(' vs ');

      const msg = result.winner
        ? `VICTORY: ${colorName(result.winner)} (${summary}) · Game of Life active.`
        : `RESULT: TIE (${summary}) · Game of Life active.`;

      setStatusMessage(msg);
      bumpRender();
    },
    [bumpRender, startGameOfLife]
  );

  const scheduleAIMoveRef = useRef<() => void>(() => {});

  const runAIMove = useCallback(async () => {
    const g = gameRef.current;
    if (g.gameOver || stateMirrorRef.current.mode === 'setup') return;

    const colorAtStart = g.currentPlayer;
    const startKey = g.positionKey();
    const token = ++aiRequestTokenRef.current;

    setAiThinking(true);
    setStatusMessage(`${colorName(colorAtStart)} AI is searching...`);

    try {
      const result = await PachiInspiredTorusAI.search(
        g,
        { komi: stateMirrorRef.current.komi },
        () => token !== aiRequestTokenRef.current
      );

      if (token !== aiRequestTokenRef.current || result.aborted) return;

      if (
        g.gameOver ||
        g.currentPlayer !== colorAtStart ||
        g.positionKey() !== startKey
      ) {
        setAiThinking(false);
        return;
      }

      setAiThinking(false);

      const chosen = result.move;
      if (chosen < 0) {
        const moveResult = g.pass();
        if (moveResult.success && moveResult.gameOver) {
          doScore();
        } else if (moveResult.success) {
          setStatusMessage(`${colorName(colorAtStart)} AI passed.`);
        } else {
          setStatusMessage(`AI pass failed: ${moveResult.reason || 'UNKNOWN'}`);
        }
        if (moveResult.success && !moveResult.gameOver) {
          setLastScoreResult(null);
          setShowTerritory(false);
        }
      } else {
        const x = chosen % g.width;
        const y = Math.floor(chosen / g.width);
        const moveResult = g.playMove(x, y);
        if (moveResult.success) {
          setLastScoreResult(null);
          setShowTerritory(false);
          if (moveResult.gameOver) {
            setAtariStones(new Set());
            startGameOfLife(g.board);
            setStatusMessage('TRIPLE KO: NO RESULT (TIE) · Game of Life active.');
            bumpRender();
            return;
          }
          setStatusMessage(
            `${colorName(colorAtStart)} AI played ${coordToLabel(x, y, g.height)}. Captured: ${moveResult.captured}.`
          );
        } else {
          setStatusMessage(`AI move failed: ${moveResult.reason || 'UNKNOWN'}`);
        }
      }

      refreshAtari(stateMirrorRef.current.mode);
      bumpRender();
      scheduleAIMoveRef.current();
    } catch {
      if (token === aiRequestTokenRef.current) {
        setAiThinking(false);
        setStatusMessage('AI search failed.');
      }
    }
  }, [bumpRender, doScore, refreshAtari]);

  const scheduleAIMove = useCallback(() => {
    const g = gameRef.current;
    const { mode: curMode, aiPlayers: bots } = stateMirrorRef.current;
    if (curMode !== 'play' || g.gameOver) return;
    if (!bots.has(g.currentPlayer)) return;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
    }
    const token = ++aiRequestTokenRef.current;

    aiTimerRef.current = setTimeout(() => {
      if (token === aiRequestTokenRef.current) {
        runAIMove();
      }
    }, 240);
  }, [runAIMove]);

  scheduleAIMoveRef.current = scheduleAIMove;

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      aiRequestTokenRef.current++;
    };
  }, []);

  const handleBoardClick = useCallback(
    (bx: number, by: number) => {
      const g = gameRef.current;
      if (mode === 'setup') {
        if (setupColor === EMPTY) {
          if (g.board[by][bx] !== EMPTY) {
            g.board[by][bx] = EMPTY;
            setStatusMessage(`Cleared ${coordToLabel(bx, by, g.height)}.`);
            bumpRender();
          }
        } else if (g.board[by][bx] === EMPTY) {
          g.board[by][bx] = setupColor;
          setStatusMessage(
            `Placed ${colorName(setupColor)} stone at ${coordToLabel(bx, by, g.height)}.`
          );
          bumpRender();
        }
        return;
      }

      if (g.gameOver) return;
      if (aiThinking || aiPlayers.has(g.currentPlayer)) {
        setStatusMessage('AI is to move. Wait for the bot or switch this player to HUMAN.');
        return;
      }

      const result = g.playMove(bx, by);
      if (result.success) {
        setLastScoreResult(null);
        setShowTerritory(false);
        if (result.gameOver) {
          setAtariStones(new Set());
          startGameOfLife(g.board);
          setStatusMessage('TRIPLE KO: NO RESULT (TIE) · Game of Life active.');
          bumpRender();
          return;
        }
        setStatusMessage(
          `Played ${coordToLabel(bx, by, g.height)}. Captured: ${result.captured}.`
        );
        refreshAtari(mode);
        bumpRender();
        scheduleAIMove();
      } else {
        setStatusMessage(
          `Illegal move (${coordToLabel(bx, by, g.height)}): ${result.reason}`
        );
      }
    },
    [aiPlayers, aiThinking, bumpRender, mode, refreshAtari, scheduleAIMove, setupColor, startGameOfLife]
  );

  const handlePass = useCallback(() => {
    const g = gameRef.current;
    if (g.gameOver || mode === 'setup') return;
    if (aiThinking || aiPlayers.has(g.currentPlayer)) {
      setStatusMessage('AI is to move.');
      return;
    }

    const passer = g.currentPlayer;
    const result = g.pass();
    if (result.success) {
      if (result.gameOver) {
        doScore();
      } else {
        setStatusMessage(`${colorName(passer)} passed.`);
        refreshAtari(mode);
        bumpRender();
        scheduleAIMove();
      }
    }
  }, [aiPlayers, aiThinking, bumpRender, doScore, mode, refreshAtari, scheduleAIMove]);

  const handleUndo = useCallback(() => {
    if (mode === 'setup') return;
    cancelPendingAI();
    const g = gameRef.current;
    const active = g.getActivePlayersList();
    const hasHuman = active.some((p) => !aiPlayers.has(p));

    let undone = 0;
    if (hasHuman && aiPlayers.size > 0) {
      while (g.history.length > 0) {
        const lastEntry = g.history[g.history.length - 1];
        if (!g.undo()) break;
        undone++;
        if (!aiPlayers.has(lastEntry.player)) {
          break;
        }
      }
    } else if (g.undo()) {
      undone = 1;
    }

    if (undone > 0) {
      stopGameOfLife();
      setLastScoreResult(null);
      setShowTerritory(false);
      setStatusMessage(`Reverted ${undone} move${undone === 1 ? '' : 's'}.`);
      refreshAtari(mode);
      bumpRender();
    }
  }, [aiPlayers, bumpRender, cancelPendingAI, mode, refreshAtari, stopGameOfLife]);

  const handleToggleTerritory = useCallback(() => {
    if (mode === 'setup' || lifeState !== null) return;
    if (!showTerritory) {
      setLastScoreResult(gameRef.current.scoreGame(komi));
      setShowTerritory(true);
    } else {
      setShowTerritory(false);
    }
  }, [komi, lifeState, mode, showTerritory]);

  const handleResign = useCallback(() => {
    const g = gameRef.current;
    if (g.gameOver || mode === 'setup') return;
    cancelPendingAI();
    const resigner = g.currentPlayer;
    const outcome = g.resignCurrentPlayer();
    if (outcome.gameOver) {
      setLastScoreResult(g.scoreGame(stateMirrorRef.current.komi));
      setShowTerritory(false);
      setAtariStones(new Set());
      startGameOfLife(g.board);
      setStatusMessage(
        outcome.winner
          ? `RESIGNATION ACCEPTED. ${colorName(outcome.winner)} WINS · Game of Life active.`
          : 'RESIGNATION ACCEPTED. MATCH COMPLETE · Game of Life active.'
      );
      bumpRender();
    } else {
      setStatusMessage(`${colorName(resigner)} resigned. ${colorName(g.currentPlayer)} to move.`);
      bumpRender();
      scheduleAIMove();
    }
  }, [bumpRender, cancelPendingAI, mode, scheduleAIMove, startGameOfLife]);

  const handleNewGame = useCallback(
    (override?: { width: number; height: number; playerCount: PlayerCount }) => {
      cancelPendingAI();
      stopGameOfLife();
      const nextW = clampBoardDim(override?.width ?? pendingWidth);
      const nextH = clampBoardDim(override?.height ?? pendingHeight);
      const nextP = override?.playerCount ?? pendingPlayerCount;

      gameRef.current = new GoGame(nextW, nextH, nextP);
      setBoardWidth(nextW);
      setBoardHeight(nextH);
      setPendingWidth(nextW);
      setPendingHeight(nextH);
      setPlayerCount(nextP);
      setPendingPlayerCount(nextP);

      // Ensure setup brush/nextPlayer & AI set stay within active players
      const activeSet = new Set(getActivePlayers(nextP));
      setAiPlayers((prev) => {
        const filtered = new Set<PlayerColor>();
        for (const p of prev) {
          if (activeSet.has(p)) filtered.add(p);
        }
        stateMirrorRef.current.aiPlayers = filtered;
        return filtered;
      });
      setSetupColor((prev) => (prev === EMPTY || activeSet.has(prev) ? prev : WHITE));
      setSetupNextPlayer((prev) => (activeSet.has(prev) ? prev : WHITE));

      setCameraX((nextW - 1) / 2);
      setCameraY((nextH - 1) / 2);
      setLastScoreResult(null);
      setShowTerritory(false);
      setMode('play');
      stateMirrorRef.current.mode = 'play';
      setAtariStones(new Set());
      setStatusMessage(`${colorName(gameRef.current.currentPlayer)} to move.`);
      bumpRender();
      scheduleAIMove();
    },
    [bumpRender, cancelPendingAI, pendingHeight, pendingPlayerCount, pendingWidth, scheduleAIMove, stopGameOfLife]
  );

  const handlePendingConfigChange = useCallback(
    (next: { width?: number; height?: number; playerCount?: PlayerCount }) => {
      if (next.width !== undefined) setPendingWidth(clampBoardDim(next.width));
      if (next.height !== undefined) setPendingHeight(clampBoardDim(next.height));
      if (next.playerCount !== undefined) setPendingPlayerCount(next.playerCount);
    },
    []
  );

  const handleModeChange = useCallback(
    (nextMode: GameMode) => {
      cancelPendingAI();
      setMode(nextMode);
      stateMirrorRef.current.mode = nextMode;
      if (nextMode === 'setup') {
        stopGameOfLife();
        setAtariStones(new Set());
        setStatusMessage('Setup mode active. Click intersections to place or erase stones.');
      } else {
        refreshAtari('play');
        setStatusMessage(`${colorName(gameRef.current.currentPlayer)} to move.`);
        scheduleAIMove();
      }
      bumpRender();
    },
    [bumpRender, cancelPendingAI, refreshAtari, scheduleAIMove, stopGameOfLife]
  );

  const handleExecuteSetupPlay = useCallback(() => {
    cancelPendingAI();
    stopGameOfLife();
    const g = gameRef.current;
    g.currentPlayer = setupNextPlayer;
    g.history = [];
    g.captures = { [WHITE]: 0, 2: 0, 3: 0, 4: 0 };
    g.eliminatedPlayers = new Set();
    g.koPoint = null;
    g.consecutivePasses = 0;
    g.gameOver = false;
    g.winner = null;
    g.lastMove = null;
    g.resetPositionHistory();

    setLastScoreResult(null);
    setShowTerritory(false);
    setMode('play');
    stateMirrorRef.current.mode = 'play';
    refreshAtari('play');
    setStatusMessage(`${colorName(g.currentPlayer)} to move from custom position.`);
    bumpRender();
    scheduleAIMove();
  }, [bumpRender, cancelPendingAI, refreshAtari, scheduleAIMove, setupNextPlayer, stopGameOfLife]);

  const handlePurgeBoard = useCallback(() => {
    stopGameOfLife();
    const g = gameRef.current;
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        g.board[y][x] = EMPTY;
      }
    }
    g.captures = { [WHITE]: 0, 2: 0, 3: 0, 4: 0 };
    g.eliminatedPlayers = new Set();
    g.currentPlayer = WHITE;
    g.koPoint = null;
    g.lastMove = null;
    g.history = [];
    g.consecutivePasses = 0;
    g.gameOver = false;
    g.winner = null;
    g.resetPositionHistory();

    setLastScoreResult(null);
    setShowTerritory(false);
    setAtariStones(new Set());
    setStatusMessage('Board purged.');
    bumpRender();
  }, [bumpRender, stopGameOfLife]);

  const handleToggleAiPlayer = useCallback(
    (player: PlayerColor, enabled: boolean) => {
      cancelPendingAI();
      setAiPlayers((prev) => {
        const next = new Set<PlayerColor>(prev);
        if (enabled) next.add(player);
        else next.delete(player);
        stateMirrorRef.current.aiPlayers = next;
        return next;
      });
      setTimeout(() => scheduleAIMove(), 0);
    },
    [cancelPendingAI, scheduleAIMove]
  );

  const handleKomiChange = useCallback(
    (nextKomi: number) => {
      setKomi(nextKomi);
      if (showTerritory) {
        setLastScoreResult(gameRef.current.scoreGame(nextKomi));
      }
    },
    [showTerritory]
  );

  const handleCenterView = useCallback(() => {
    if (stateMirrorRef.current.aiThinking) return;
    const w = gameRef.current.width;
    const h = gameRef.current.height;
    setCameraX((w - 1) / 2);
    setCameraY((h - 1) / 2);
  }, []);

  const handleResetZoom = useCallback(() => {
    if (stateMirrorRef.current.aiThinking) return;
    const w = gameRef.current.width;
    const h = gameRef.current.height;
    const halfX = (w - 1) / 2;
    const halfY = (h - 1) / 2;
    setZoomLevel(1.0);
    setCameraX((prevX) => Math.round((prevX - halfX) / w) * w + halfX);
    setCameraY((prevY) => Math.round((prevY - halfY) / h) * h + halfY);
  }, []);

  const handleCameraChange = useCallback((x: number, y: number) => {
    if (stateMirrorRef.current.aiThinking) return;
    setCameraX(x);
    setCameraY(y);
  }, []);

  const handleZoomChange = useCallback((z: number, newCamX?: number, newCamY?: number) => {
    if (stateMirrorRef.current.aiThinking) return;
    setZoomLevel(z);
    if (newCamX !== undefined && newCamY !== undefined) {
      setCameraX(newCamX);
      setCameraY(newCamY);
    }
  }, []);

  const game = gameRef.current;
  const liveScore = game.scoreGame(komi);
  const hasMoves =
    game.history.length > 0 ||
    game.board.some((row) => row.some((cell) => cell !== EMPTY));

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-[#0d0d0d] text-[#f0f0f0]">
      <TorusGoHeader
        boardWidth={boardWidth}
        boardHeight={boardHeight}
        playerCount={playerCount}
        currentPlayer={game.currentPlayer}
        gameOver={game.gameOver}
        aiThinking={aiThinking}
        onNewGame={() => handleNewGame()}
      />

      <main className="flex-1 min-h-0 flex relative overflow-hidden">
        <div className="relative flex-1 min-w-0 min-h-0 flex">
          <MinimalBoardControls
            boardWidth={boardWidth}
            boardHeight={boardHeight}
            pendingWidth={pendingWidth}
            pendingHeight={pendingHeight}
            playerCount={playerCount}
            pendingPlayerCount={pendingPlayerCount}
            komi={komi}
            mode={mode}
            currentPlayer={game.currentPlayer}
            eliminatedPlayers={game.eliminatedPlayers}
            moveCount={game.history.length + 1}
            captures={game.captures}
            liveScore={liveScore}
            gameOver={game.gameOver}
            winner={game.winner}
            hasMoves={hasMoves}
            aiPlayers={aiPlayers}
            setupColor={setupColor}
            setupNextPlayer={setupNextPlayer}
            showTerritory={showTerritory}
            onPass={handlePass}
            onUndo={handleUndo}
            onToggleTerritory={handleToggleTerritory}
            onNewGame={handleNewGame}
            onResign={handleResign}
            onPendingConfigChange={handlePendingConfigChange}
            onKomiChange={handleKomiChange}
            onModeChange={handleModeChange}
            onToggleAiPlayer={handleToggleAiPlayer}
            onSetSetupColor={setSetupColor}
            onSetSetupNextPlayer={setSetupNextPlayer}
            onExecuteSetupPlay={handleExecuteSetupPlay}
            onPurgeBoard={handlePurgeBoard}
            lifeActive={lifeState !== null}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((v) => !v)}
          />

          <TorusBoardCanvas
            game={game}
            renderVersion={renderVersion}
            mode={mode}
            setupColor={setupColor}
            showTerritory={showTerritory}
            lastScoreResult={lastScoreResult}
            atariStones={atariStones}
            aiThinking={aiThinking}
            cameraX={cameraX}
            cameraY={cameraY}
            zoomLevel={zoomLevel}
            onCameraChange={handleCameraChange}
            onZoomChange={handleZoomChange}
            onBoardClick={handleBoardClick}
            onResetZoom={handleResetZoom}
            onCenterView={handleCenterView}
            onSetSetupColor={setSetupColor}
            lifeBoard={lifeState?.board ?? null}
            lifeGeneration={lifeState?.generation ?? 0}
          />

          <WinnerPopup
            open={game.gameOver}
            winner={game.winner}
          />
        </div>
      </main>

      {/* Live Match Status Bar */}
      <div
        role="status"
        aria-live="polite"
        className="shrink-0 px-5 py-2 bg-[#141414] border-t border-[#383838] flex items-center justify-between gap-4 font-mono text-[11px]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[#f0f0f0] truncate">{statusMessage}</span>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[#8c8c8c] shrink-0 tabular-nums">
          <span>
            PASSES: {game.consecutivePasses}/{game.getRemainingPlayersCount()}
          </span>
          <span className="text-[#383838]">|</span>
          <span>HISTORY: {game.history.length} MOVES</span>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
