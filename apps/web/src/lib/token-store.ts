/**
 * In-memory token store (SEC-2).
 *
 * Keeps the JWT out of sessionStorage / localStorage so it cannot be read
 * by any injected third-party script. The token is lost on page reload —
 * acceptable for a self-hosted internal dashboard.
 */
let _token = ''

export const tokenStore = {
  get: (): string => _token,
  set: (t: string): void => { _token = t },
  clear: (): void => { _token = '' },
}
