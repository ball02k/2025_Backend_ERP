import React from "react";

// Pass-through gate: renders children unconditionally
export default function FeatureGate({ children /*, feature*/ }) {
  return <>{children}</>;
}

