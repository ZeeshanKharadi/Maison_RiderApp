/** Runtime override from /config.js (IIS deploy). */
export function apiBase(): string {
  const runtime =
    typeof window !== 'undefined'
      ? (window as Window & { __MAISON_API_URL__?: string }).__MAISON_API_URL__
      : undefined;
  if (runtime && runtime.trim().length > 0) {
    return runtime.trim().replace(/\/$/, '');
  }

  const env = import.meta.env.VITE_API_URL as string | undefined;
  return env && env.length > 0 ? env.replace(/\/$/, '') : '';
}
