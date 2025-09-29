// NO-OP FEATURE FLAGS — always allow
export type Features = Record<string, boolean>;
export function useFeatures(): { features: Features; ready: boolean; error?: string } {
  return { features: {}, ready: true };
}

