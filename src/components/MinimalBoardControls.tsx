// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useState, useEffect } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import {
  CellValue,
  clampBoardDim,
  colorName,
  EMPTY,
  GameMode,
  getActivePlayers,
  MAX_BOARD_DIM,
  MIN_BOARD_DIM,
  PLAYER_META,
  PlayerColor,
  PlayerCount,
  ScoreResult,
} from '../engine/torusGo';

interface PendingConfig {
  width: number;
  height: number;
  playerCount: PlayerCount;
}

interface MinimalBoardControlsProps {
  boardWidth: number;
  boardHeight: number;
  pendingWidth: number;
  pendingHeight: number;
  playerCount: PlayerCount;
  pendingPlayerCount: PlayerCount;
  komi: number;
  mode: GameMode;
  currentPlayer: PlayerColor;
  eliminatedPlayers: Set<PlayerColor>;
  moveCount: number;
  captures: Record<PlayerColor, number>;
  liveScore: ScoreResult;
  gameOver: boolean;
  winner: PlayerColor | null;
  hasMoves: boolean;
  aiPlayers: Set<PlayerColor>;
  setupColor: CellValue;
  setupNextPlayer: PlayerColor;
  showTerritory: boolean;
  onPass: () => void;
  onUndo: () => void;
  onToggleTerritory: () => void;
  onNewGame: (override?: PendingConfig) => void;
  onResign: () => void;
  onPendingConfigChange: (next: Partial<PendingConfig>) => void;
  onKomiChange: (komi: number) => void;
  onModeChange: (mode: GameMode) => void;
  onToggleAiPlayer: (player: PlayerColor, enabled: boolean) => void;
  onSetSetupColor: (color: CellValue) => void;
  onSetSetupNextPlayer: (player: PlayerColor) => void;
  onExecuteSetupPlay: () => void;
  onPurgeBoard: () => void;
  lifeActive: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
}

export const MinimalBoardControls: React.FC<MinimalBoardControlsProps> = ({
  boardWidth,
  boardHeight,
  pendingWidth,
  pendingHeight,
  playerCount,
  pendingPlayerCount,
  komi,
  mode,
  currentPlayer,
  eliminatedPlayers,
  moveCount,
  captures,
  liveScore,
  gameOver,
  winner,
  hasMoves,
  aiPlayers,
  setupColor,
  setupNextPlayer,
  showTerritory,
  onPass,
  onUndo,
  onToggleTerritory,
  onNewGame,
  onResign,
  onPendingConfigChange,
  onKomiChange,
  onModeChange,
  onToggleAiPlayer,
  onSetSetupColor,
  onSetSetupNextPlayer,
  onExecuteSetupPlay,
  onPurgeBoard,
  lifeActive,
  panelOpen,
  onTogglePanel,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingConfig | null>(null);
  const [draftWidth, setDraftWidth] = useState<string>(String(pendingWidth));
  const [draftHeight, setDraftHeight] = useState<string>(String(pendingHeight));

  useEffect(() => {
    setDraftWidth(String(pendingWidth));
  }, [pendingWidth]);

  useEffect(() => {
    setDraftHeight(String(pendingHeight));
  }, [pendingHeight]);

  useEffect(() => {
    setConfirmResign(false);
    setConfirmPurge(false);
  }, [mode, gameOver, moveCount]);

  const requestConfigChange = (partial: Partial<PendingConfig>) => {
    const nextCfg: PendingConfig = {
      width: partial.width !== undefined ? clampBoardDim(partial.width) : pendingWidth,
      height: partial.height !== undefined ? clampBoardDim(partial.height) : pendingHeight,
      playerCount: partial.playerCount ?? pendingPlayerCount,
    };

    onPendingConfigChange(nextCfg);

    const sameAsLive =
      nextCfg.width === boardWidth &&
      nextCfg.height === boardHeight &&
      nextCfg.playerCount === playerCount;

    if (sameAsLive) {
      setPendingPrompt(null);
      return;
    }

    if (!hasMoves) {
      setPendingPrompt(null);
      onNewGame(nextCfg);
    } else {
      setPendingPrompt(nextCfg);
    }
  };

  const activePlayers = getActivePlayers(playerCount);

  return (
    <aside
      aria-label="Match Overview & Controls"
      className="absolute z-10 top-3 left-3 w-[248px] sm:w-[272px] max-h-[calc(100%-56px)] flex flex-col overflow-hidden bg-[#141414]/92 backdrop-blur-sm border border-[#383838] shadow-2xl select-none"
    >
      <div className="shrink-0 h-[2px] w-full bg-gradient-to-r from-[#c30800] via-[#c300bb] to-[#bbc300]" />

      {/* Header strip */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand match overview' : 'Minimize match overview'}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setCollapsed((v) => !v);
          }
        }}
        className="shrink-0 px-2.5 py-1.5 border-b border-[#2e2e2e] bg-gradient-to-r from-[#c30800]/10 via-transparent to-transparent flex items-center justify-between gap-2 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 border shrink-0 ${PLAYER_META[currentPlayer].swatchClass}`} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#f0f0f0] truncate">
            {gameOver ? (winner ? `${colorName(winner)} WINS` : 'TIE') : `${colorName(currentPlayer)}`}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            id="toggle-controls-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (collapsed && !panelOpen) {
                setCollapsed(false);
              }
              onTogglePanel();
            }}
            aria-expanded={panelOpen}
            className={`flex items-center gap-1 px-1.5 py-0.5 border font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              panelOpen
                ? 'bg-[#262626] text-[#f0f0f0] border-[#c30800]'
                : 'bg-[#1a1a1a] hover:bg-[#262626] text-[#f0f0f0] border-[#383838]'
            }`}
          >
            <SlidersHorizontal className="w-2.5 h-2.5 text-[#c30800]" />
            <span>CONTROLS</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-2.5 flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {/* Match Overview */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-[#8c8c8c]">
              <span>MATCH OVERVIEW</span>
              <span className="tabular-nums">
                {boardWidth}x{boardHeight} &middot; {playerCount}P &middot; JPN
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {activePlayers.map((p) => {
                const meta = PLAYER_META[p];
                const isEliminated = eliminatedPlayers.has(p);
                const isBot = aiPlayers.has(p);
                const isTurn = !gameOver && currentPlayer === p;
                const playerKomi = liveScore.komiByPlayer[p];

                return (
                  <div
                    key={p}
                    className={`border px-2 py-1.5 flex flex-col gap-0.5 transition-colors ${
                      isTurn ? meta.turnCardClass : 'border-[#383838] bg-[#1a1a1a]/90'
                    } ${isEliminated ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-[9px] font-bold tracking-wider truncate ${
                          isTurn ? meta.turnTextClass : 'text-[#8c8c8c]'
                        }`}
                      >
                        {meta.name}
                        {isBot ? '·AI' : ''}
                        {isEliminated ? '·OUT' : ''}
                      </span>
                      <span className={`w-2 h-2 border shrink-0 ${meta.swatchClass}`} />
                    </div>
                    <span className="font-mono text-sm font-bold text-[#f0f0f0] tabular-nums leading-tight">
                      {liveScore.scores[p].toFixed(1)}
                    </span>
                    <span className="font-mono text-[9px] text-[#737373] tabular-nums leading-tight">
                      TER {liveScore.territory[p]} &middot; CAP {captures[p]}
                      {playerKomi !== 0 ? ` +${playerKomi}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game Actions */}
          <div className="pt-2 border-t border-[#2e2e2e] flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#8c8c8c]">
              GAME ACTIONS
            </span>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={mode === 'setup' || gameOver}
                onClick={onPass}
                className="py-1.5 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-40 border border-[#383838] text-[#f0f0f0] font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer"
              >
                PASS
              </button>
              <button
                type="button"
                disabled={mode === 'setup' || !hasMoves}
                onClick={onUndo}
                className="py-1.5 bg-[#1a1a1a] hover:bg-[#262626] disabled:opacity-40 border border-[#383838] text-[#f0f0f0] font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer"
              >
                UNDO
              </button>
              <button
                type="button"
                disabled={mode === 'setup' || lifeActive}
                onClick={onToggleTerritory}
                className={`col-span-2 py-1.5 border font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40 ${
                  showTerritory
                    ? 'bg-[#262626] border-[#bbc300] text-[#bbc300]'
                    : 'bg-[#1a1a1a] hover:bg-[#262626] border-[#383838] text-[#f0f0f0]'
                }`}
              >
                TERRITORY
              </button>

              {confirmResign ? (
                <div className="col-span-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmResign(false);
                      onResign();
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 bg-[#c3005a] text-[#f3f3f7] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>CONFIRM</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResign(false)}
                    className="flex items-center justify-center gap-1 py-1.5 bg-[#1a1a1a] border border-[#383838] text-[#8c8c8c] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>CANCEL</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={mode === 'setup' || gameOver}
                  onClick={() => setConfirmResign(true)}
                  className="col-span-2 py-1.5 bg-[#1a1a1a] hover:bg-[#c3005a]/20 disabled:opacity-40 border border-[#383838] hover:border-[#c3005a] text-[#f0f0f0] font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                >
                  RESIGN
                </button>
              )}
            </div>
          </div>

          {panelOpen && (
            <>
              {/* Board & Rules */}
              <div className="pt-2 border-t border-[#2e2e2e] flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-[#8c8c8c] shrink-0">PLAYERS</span>
                  <div className="grid grid-cols-3 w-28 gap-0.5 p-0.5 bg-[#0d0d0d] border border-[#383838]">
                    {([2, 3, 4] as PlayerCount[]).map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => requestConfigChange({ playerCount: cnt })}
                        className={`py-1 rounded-none border font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                          pendingPlayerCount === cnt
                            ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                            : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                        }`}
                      >
                        {cnt}P
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-[#8c8c8c] shrink-0">PRESETS</span>
                  <div className="grid grid-cols-3 w-28 gap-0.5 p-0.5 bg-[#0d0d0d] border border-[#383838]">
                    {[9, 13, 19].map((dim) => {
                      const isActive = pendingWidth === dim && pendingHeight === dim;
                      return (
                        <button
                          key={dim}
                          type="button"
                          onClick={() => requestConfigChange({ width: dim, height: dim })}
                          className={`py-1 rounded-none border font-mono text-[9px] uppercase transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                              : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                          }`}
                        >
                          {dim}x{dim}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    <label
                      htmlFor="board-width-input"
                      className="font-mono text-[9px] text-[#8c8c8c]"
                    >
                      WIDTH ({MIN_BOARD_DIM}–{MAX_BOARD_DIM})
                    </label>
                    <input
                      id="board-width-input"
                      type="number"
                      min={MIN_BOARD_DIM}
                      max={MAX_BOARD_DIM}
                      value={draftWidth}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDraftWidth(raw);
                        const v = parseInt(raw, 10);
                        if (Number.isFinite(v) && v >= MIN_BOARD_DIM && v <= MAX_BOARD_DIM) {
                          requestConfigChange({ width: v });
                        }
                      }}
                      onBlur={() => {
                        const v = parseInt(draftWidth, 10);
                        const clamped = Number.isFinite(v) ? clampBoardDim(v) : pendingWidth;
                        setDraftWidth(String(clamped));
                        if (clamped !== pendingWidth) {
                          requestConfigChange({ width: clamped });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = parseInt(draftWidth, 10);
                          const clamped = Number.isFinite(v) ? clampBoardDim(v) : pendingWidth;
                          setDraftWidth(String(clamped));
                          requestConfigChange({ width: clamped });
                        }
                      }}
                      className="w-full px-2 py-1 bg-[#1a1a1a] border border-[#383838] text-[#f0f0f0] font-mono text-[11px] tabular-nums focus:outline-none focus:border-[#c30800]"
                    />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <label
                      htmlFor="board-height-input"
                      className="font-mono text-[9px] text-[#8c8c8c]"
                    >
                      HEIGHT ({MIN_BOARD_DIM}–{MAX_BOARD_DIM})
                    </label>
                    <input
                      id="board-height-input"
                      type="number"
                      min={MIN_BOARD_DIM}
                      max={MAX_BOARD_DIM}
                      value={draftHeight}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDraftHeight(raw);
                        const v = parseInt(raw, 10);
                        if (Number.isFinite(v) && v >= MIN_BOARD_DIM && v <= MAX_BOARD_DIM) {
                          requestConfigChange({ height: v });
                        }
                      }}
                      onBlur={() => {
                        const v = parseInt(draftHeight, 10);
                        const clamped = Number.isFinite(v) ? clampBoardDim(v) : pendingHeight;
                        setDraftHeight(String(clamped));
                        if (clamped !== pendingHeight) {
                          requestConfigChange({ height: clamped });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = parseInt(draftHeight, 10);
                          const clamped = Number.isFinite(v) ? clampBoardDim(v) : pendingHeight;
                          setDraftHeight(String(clamped));
                          requestConfigChange({ height: clamped });
                        }
                      }}
                      className="w-full px-2 py-1 bg-[#1a1a1a] border border-[#383838] text-[#f0f0f0] font-mono text-[11px] tabular-nums focus:outline-none focus:border-[#c30800]"
                    />
                  </div>
                </div>

                {pendingPrompt !== null && (
                  <div className="border border-[#c36a00]/60 bg-[#1a1a1a] p-2 flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] text-[#f0f0f0]">
                      New {pendingPrompt.width}x{pendingPrompt.height} ({pendingPrompt.playerCount}P) match?
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const target = pendingPrompt;
                          setPendingPrompt(null);
                          onNewGame(target);
                        }}
                        className="px-2 py-1 bg-[#c30800] hover:bg-[#f60a00] text-[#f3f3f7] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        APPLY
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingPrompt(null);
                          onPendingConfigChange({
                            width: boardWidth,
                            height: boardHeight,
                            playerCount,
                          });
                        }}
                        className="px-2 py-1 bg-[#141414] hover:bg-[#262626] border border-[#383838] text-[#8c8c8c] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="komi-input"
                    className="font-mono text-[10px] text-[#8c8c8c] shrink-0"
                  >
                    KOMI
                  </label>
                  <input
                    id="komi-input"
                    type="number"
                    step="0.5"
                    value={komi}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      onKomiChange(Number.isFinite(v) ? v : 0);
                    }}
                    className="w-28 px-2 py-1 bg-[#1a1a1a] border border-[#383838] text-[#f0f0f0] font-mono text-[11px] tabular-nums focus:outline-none focus:border-[#c30800]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-[#8c8c8c] shrink-0">MODE</span>
                  <div className="grid grid-cols-2 w-28 gap-0.5 p-0.5 bg-[#0d0d0d] border border-[#383838]">
                    <button
                      type="button"
                      onClick={() => onModeChange('play')}
                      className={`py-1 rounded-none border font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                        mode === 'play'
                          ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                          : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                      }`}
                    >
                      PLAY
                    </button>
                    <button
                      type="button"
                      onClick={() => onModeChange('setup')}
                      className={`py-1 rounded-none border font-mono text-[10px] uppercase transition-colors cursor-pointer ${
                        mode === 'setup'
                          ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                          : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                      }`}
                    >
                      SETUP
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Opponent (Play mode) or Position Editor (Setup mode) */}
              {mode === 'play' ? (
                <div className="pt-2 border-t border-[#2e2e2e] flex flex-col gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#8c8c8c]">
                    AI OPPONENT
                  </span>

                  <div className="flex flex-col gap-1">
                    {activePlayers.map((p) => {
                      const meta = PLAYER_META[p];
                      const isBot = aiPlayers.has(p);
                      return (
                        <div key={p} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#f0f0f0]">
                            <span className={`w-2 h-2 border ${meta.swatchClass}`} />
                            <span>{meta.name}</span>
                          </div>
                          <div className="grid grid-cols-2 w-28 gap-0.5 p-0.5 bg-[#0d0d0d] border border-[#383838]">
                            <button
                              type="button"
                              onClick={() => onToggleAiPlayer(p, false)}
                              className={`py-0.5 rounded-none border font-mono text-[9px] uppercase transition-colors cursor-pointer ${
                                !isBot
                                  ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                                  : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                              }`}
                            >
                              HUMAN
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleAiPlayer(p, true)}
                              className={`py-0.5 rounded-none border font-mono text-[9px] uppercase transition-colors cursor-pointer ${
                                isBot
                                  ? 'bg-[#1a1a1a] text-[#f0f0f0] border-[#c30800] font-semibold'
                                  : 'bg-[#141414] text-[#8c8c8c] border-[#2e2e2e] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] hover:border-[#383838]'
                              }`}
                            >
                              BOT
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-[#2e2e2e] flex flex-col gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[#8c8c8c]">
                    POSITION EDITOR
                  </span>

                  <div className="grid grid-cols-2 gap-1.5">
                    {activePlayers.map((p) => {
                      const meta = PLAYER_META[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => onSetSetupColor(p)}
                          className={`flex items-center justify-center gap-1.5 py-1.5 border font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                            setupColor === p
                              ? 'bg-[#262626] border-[#c30800] text-[#f0f0f0]'
                              : 'bg-[#1a1a1a] border-[#383838] text-[#8c8c8c] hover:text-[#f0f0f0]'
                          }`}
                        >
                          <span className={`w-2 h-2 border ${meta.swatchClass}`} />
                          <span>{meta.name}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => onSetSetupColor(EMPTY)}
                      className={`col-span-2 py-1.5 border font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer ${
                        setupColor === EMPTY
                          ? 'bg-[#262626] border-[#c30800] text-[#f0f0f0]'
                          : 'bg-[#1a1a1a] border-[#383838] text-[#8c8c8c] hover:text-[#f0f0f0]'
                      }`}
                    >
                      ERASE
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="setup-next-player"
                      className="font-mono text-[10px] text-[#8c8c8c] shrink-0"
                    >
                      NEXT TURN
                    </label>
                    <select
                      id="setup-next-player"
                      value={setupNextPlayer}
                      onChange={(e) => onSetSetupNextPlayer(Number(e.target.value) as PlayerColor)}
                      className="w-28 px-2 py-1 bg-[#1a1a1a] border border-[#383838] text-[#f0f0f0] font-mono text-[10px] focus:outline-none focus:border-[#c30800]"
                    >
                      {activePlayers.map((p) => (
                        <option key={p} value={p}>
                          {PLAYER_META[p].name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={onExecuteSetupPlay}
                    className="w-full py-1.5 bg-[#c30800] hover:bg-[#f60a00] text-[#f3f3f7] font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    APPLY &amp; PLAY
                  </button>

                  {confirmPurge ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmPurge(false);
                          onPurgeBoard();
                        }}
                        className="flex items-center justify-center gap-1 py-1.5 bg-[#c3005a] text-[#f3f3f7] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>CONFIRM</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPurge(false)}
                        className="flex items-center justify-center gap-1 py-1.5 bg-[#1a1a1a] border border-[#383838] text-[#8c8c8c] font-mono text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>CANCEL</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmPurge(true)}
                      className="w-full py-1.5 bg-[#1a1a1a] hover:bg-[#262626] border border-[#383838] text-[#f0f0f0] font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      PURGE BOARD
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
};
