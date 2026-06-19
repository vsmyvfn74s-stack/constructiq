/**
 * clearClientAuthState
 *
 * Wipes all client-side auth/session/onboarding cache WITHOUT deleting any
 * user data on the server. Safe to call before registration, on logout, or
 * whenever stale state causes a registration loop in a normal browser.
 */
export function clearClientAuthState() {
  try {
    // Keys we know base44 SDK and this app use — clear them explicitly
    const authKeys = [
      'base44_token',
      'base44_access_token',
      'auth_token',
      'token',
      'access_token',
      'user',
      'onboarding',
      'onboarding_step',
      'pending_email',
      'registration_email',
    ];

    authKeys.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    // Also do a full clear of sessionStorage (tab-scoped, safe to wipe entirely)
    sessionStorage.clear();

    // Wipe any remaining localStorage keys that look like auth/cache artifacts
    const lsKeys = Object.keys(localStorage);
    lsKeys.forEach(key => {
      if (
        key.startsWith('base44') ||
        key.startsWith('auth') ||
        key.startsWith('token') ||
        key.startsWith('onboard') ||
        key.startsWith('user_') ||
        key.startsWith('iq_')
      ) {
        localStorage.removeItem(key);
      }
    });

    console.info('[clientAuth] Client auth state cleared');
  } catch (e) {
    // Storage may be restricted in some environments — silently ignore
    console.warn('[clientAuth] clearClientAuthState error:', e?.message);
  }
}