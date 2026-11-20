// SPDX-License-Identifier: AGPL-3.0-or-later

import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { SkullLogo } from './SkullLogo';
import { colorName, PLAYER_META, PlayerColor, PlayerCount } from '../engine/torusGo';

interface TorusGoHeaderProps {
  boardWidth: number;
  boardHeight: number;
  playerCount: PlayerCount;
  currentPlayer: PlayerColor;
  gameOver: boolean;
  aiThinking: boolean;
  onNewGame: () => void;
}

const BRAND_NAME = '0xCONFUSED';
const SCRAMBLE_CHARS = '!@#$%^&*<>[]_01';

export const TorusGoHeader: React.FC<TorusGoHeaderProps> = ({
  boardWidth,
  boardHeight,
  playerCount,
  currentPlayer,
  gameOver,
  aiThinking,
  onNewGame,
}) => {
  const [scrambleText, setScrambleText] = useState<string>(BRAND_NAME);
  const lastHoverScrambleRef = useRef<number>(0);
  const scrambleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runScramble = () => {
    if (scrambleIntervalRef.current) {
      clearInterval(scrambleIntervalRef.current);
    }
    let iteration = 0;
    scrambleIntervalRef.current = setInterval(() => {
      setScrambleText(
        BRAND_NAME.split('')
          .map((_char, index) => {
            if (index < iteration) {
              return BRAND_NAME[index];
            }
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join('')
      );
      if (iteration >= BRAND_NAME.length) {
        if (scrambleIntervalRef.current) {
          clearInterval(scrambleIntervalRef.current);
          scrambleIntervalRef.current = null;
        }
        setScrambleText(BRAND_NAME);
      }
      iteration += 1 / 3;
    }, 30);
  };

  const handleMouseEnter = () => {
    const now = Date.now();
    if (now - lastHoverScrambleRef.current < 2000) {
      return;
    }
    lastHoverScrambleRef.current = now;
    runScramble();
  };

  useEffect(() => {
    runScramble();
    const updateTopBarHeight = () => {
      const headerEl = document.getElementById('torus-header');
      if (headerEl) {
        document.documentElement.style.setProperty('--topbar-height', `${headerEl.offsetHeight}px`);
      }
    };
    updateTopBarHeight();
    window.addEventListener('resize', updateTopBarHeight);
    return () => {
      if (scrambleIntervalRef.current) {
        clearInterval(scrambleIntervalRef.current);
      }
      window.removeEventListener('resize', updateTopBarHeight);
    };
  }, []);

  const swatchClass = PLAYER_META[currentPlayer].swatchClass;

  return (
    <header id="torus-header" className="topbar shrink-0">
      <div className="topbar-inner">
        <div className="brand">
          <div
            className="brand-logo-slot cursor-pointer"
            onMouseEnter={handleMouseEnter}
          >
            <a
              href="https://www.0xconfused.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="brand-logo-link block w-full h-full"
              aria-label="0xCONFUSED Website"
            >
              <div className="brand-logo-inner" aria-hidden="true">
                <SkullLogo
                  size={64}
                  className="w-16 h-16 object-contain opacity-100"
                />
              </div>
            </a>
          </div>

          <div className="brand-text-wrap">
            <div className="brand-title-row">
              <h1
                className="brand-glitch-text font-glitch"
                id="brandGlitchText"
                data-text="0xCONFUSED"
                onMouseEnter={handleMouseEnter}
              >
                <a
                  href="https://www.0xconfused.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline text-inherit inline-block"
                  aria-label="0xCONFUSED Website"
                >
                  <span className="brand-title">{scrambleText}</span>
                </a>
              </h1>
              <span className="brand-mod font-mono">./go</span>
            </div>
            <p className="brand-tagline">
              Toroidal Go &middot; {boardWidth}x{boardHeight} &middot; {playerCount}P
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-[#8c8c8c] font-mono font-semibold">
              Match State
            </span>
            <span
              className={`text-xs font-mono font-bold flex items-center gap-1.5 ${
                aiThinking
                  ? 'text-[#c30800]'
                  : gameOver
                  ? 'text-[#bbc300]'
                  : 'text-[#f0f0f0]'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 border ${
                  aiThinking
                    ? 'bg-[#c30800] border-[#f60a00] animate-pulse'
                    : gameOver
                    ? 'bg-[#bbc300] border-[#dce600]'
                    : swatchClass
                }`}
              />
              {aiThinking
                ? 'AI SEARCHING'
                : gameOver
                ? 'COMPLETE'
                : `${colorName(currentPlayer)} TO MOVE`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="header-new-game-btn"
              onClick={onNewGame}
              className="btn px-3.5 py-1.5 bg-[#c30800] hover:bg-[#f60a00] text-[#f3f3f7] border-[#c30800] hover:border-[#f60a00]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>NEW GAME</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
