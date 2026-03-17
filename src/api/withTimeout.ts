/** Wraps a promise (or PromiseLike, e.g. Supabase query builder) with a timeout */
const TIMEOUT_MS = 20_000

export function withTimeout<T>(promise: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please refresh the page.')), ms)
    ),
  ])
}
