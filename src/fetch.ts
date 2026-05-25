const DEFAULT_TIMEOUT = 30_000;

export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let combined: AbortSignal;
  if (options.signal) {
    combined = AbortSignal.any([options.signal, controller.signal]);
  } else {
    combined = controller.signal;
  }

  try {
    return await fetch(url, { ...options, signal: combined });
  } finally {
    clearTimeout(timeoutId);
  }
}
