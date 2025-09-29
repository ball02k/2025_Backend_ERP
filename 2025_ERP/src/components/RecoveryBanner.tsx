import React from 'react';
import { isRecoveryMode, disableRecoveryMode } from '@/lib/recovery';

export default function RecoveryBanner() {
  if (!isRecoveryMode()) return null;
  return (
    <div className="sticky top-0 z-50 w-full bg-yellow-100/95 text-yellow-900 border-b border-yellow-300">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-2 text-sm">
        <div className="font-medium">Recovery Mode is ON — feature gates are bypassed to keep the app usable.</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-yellow-800">Turn off when you’re done fixing.</span>
          <button
            onClick={() => { disableRecoveryMode(); location.reload(); }}
            className="rounded-md border border-yellow-400 bg-white/50 px-2 py-1 hover:bg-white"
          >
            Disable
          </button>
        </div>
      </div>
    </div>
  );
}

