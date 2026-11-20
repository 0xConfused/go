// SPDX-License-Identifier: AGPL-3.0-or-later

import React from 'react';

const BRAND_NAME = '0xCONFUSED';

export const SiteFooter: React.FC = () => {
  return (
    <footer
      id="site-footer"
      className="shrink-0 w-full border-t border-[#383838] bg-[#090909] text-[#8c8c8c] font-mono text-xs py-3 px-5"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="footer-identity font-mono">
          <a
            href="https://www.0xconfused.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline text-inherit inline-block"
            title="0xCONFUSED (https://www.0xconfused.com/)"
            aria-label="0xCONFUSED Website"
          >
            <span className="footer-handle font-glitch font-normal cursor-pointer">
              {BRAND_NAME}
            </span>
          </a>
          <span className="footer-sep">/</span>
          <span className="footer-name font-mono text-[#f0f0f0]">./go</span>
          <span className="footer-sep">//</span>
          <span className="footer-role">
            Toroidal Go
          </span>
        </div>

        <div className="footer-links font-mono flex items-center gap-4 text-[11px]">
          <span
            className="footer-spec hover:text-[#f0f0f0] transition-colors cursor-default"
            title="SPDX-License-Identifier: AGPL-3.0-or-later"
          >
            AGPL-3.0-or-later
          </span>
        </div>
      </div>
    </footer>
  );
};
