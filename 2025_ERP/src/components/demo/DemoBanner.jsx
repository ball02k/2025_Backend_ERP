import React from "react";
import { isDemo, disableDemo } from "@/lib/demo";

export default function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div className="sticky top-0 z-50 w-full border-b border-amber-300 bg-amber-50/95 text-amber-900">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-2 px-4 py-2 text-sm">
        <div className="font-medium">Demo mode — destructive actions are disabled.</div>
        <div className="flex items-center gap-2">
          <a className="underline" href="/demo-tour">Open tour</a>
          <a className="underline" href="/__health">Health</a>
          <a className="underline" href="/demo/reset">Reset demo data</a>
          <button onClick={disableDemo} className="rounded-md border border-amber-400 bg-white/50 px-2 py-1">
            Exit demo
          </button>
        </div>
      </div>
    </div>
  );
}

