export function useFeatures(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('features') || '{}');
  } catch {
    return {};
  }
}

