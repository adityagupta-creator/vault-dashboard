/** Wraps a promise with a timeout so fetches never hang indefinitely after idle/session expiry */
const TIMEOUT_MS = 20_000

export function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please refresh the page.')), ms)
    ),
  ])
}
