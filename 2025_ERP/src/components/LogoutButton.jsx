import React from "react";
import { clearSession } from "@/lib/auth";

export default function LogoutButton({ className = "" }) {
  return (
    <button
      className={`rounded-md border px-3 py-2 text-sm ${className}`}
      onClick={() => { clearSession(); window.location.href = "/login"; }}
      title="Sign out"
    >
      Logout
    </button>
  );
}

