# Debug Session: login-redirect-loop

## Status: [OPEN]

## Description
User reports persistent login issue: after logging in, the app redirects back to login page/auth modal keeps appearing.

## Hypotheses
1. **Auth state initialization timing**: `useAuthState`'s loading state isn't being respected, so the app renders landing page before user is confirmed as logged in.
2. **Google redirect result not being processed**: `handleGoogleRedirectResult` isn't being called or isn't setting user state properly.
3. **Persistence not working**: Firebase auth isn't persisting, so user is logged out on next render/navigation.
4. **Navigation race conditions**: Multiple `navigate` calls are happening, causing unexpected redirects.
5. **`hasTriggeredAuth` logic is wrong**: The flag isn't being set correctly for logged-in users, causing the modal to reappear.

## Timeline
- 2026-06-25: Initial debug session started
