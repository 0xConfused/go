// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';
import { colorName, PLAYER_META, PlayerColor } from '../engine/torusGo';

interface WinnerPopupProps {
  open: boolean;
  winner: PlayerColor | null;
}

export const WinnerPopup: React.FC<WinnerPopupProps> = ({ open, winner }) => {
  if (!open) return null;

  const winnerMeta = winner ? PLAYER_META[winner] : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4"
    >
      <div className="bg-[#141414]/60 border border-[#383838]/75 px-4 py-2.5 flex items-center gap-2.5">
        {winnerMeta && (
          <span className={`w-3.5 h-3.5 border shrink-0 ${winnerMeta.swatchClass}`} />
        )}
        <span
          className={`font-mono text-sm font-bold uppercase tracking-wider ${
            winnerMeta ? winnerMeta.turnTextClass : 'text-[#f0f0f0]'
          }`}
        >
          {winner ? `${colorName(winner)} WINS` : 'MATCH TIED'}
        </span>
      </div>
    </div>
  );
};
