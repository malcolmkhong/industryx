# Auth Flow — OAuth (Google & GitHub) coverage

## Status: needs Playwright (real browser)

`signInWithPassword` is **not** OAuth. The earlier draft attempted a
shortcut by creating a `provider=email` user and signing it in via the
password grant — that tests `verifyAuth()` correctly, but it does NOT
exercise the OAuth callback flow that's actually used by every real
player. Calling that "OAuth test" was misleading.

The real path is:

  Browser clicks "Sign in with Google" on /page
    → supabase.auth.signInWithOAuth({ provider: 'google' })
      → browser redirects to accounts.google.com
        → user grants permission
          → Google redirects to https://wkkzqtseqwcyyyezroqq.supabase.co/auth/v1/callback?code=…
            → /api/auth/callback exchanges code for session via
              `supabase.auth.exchangeCodeForSession(code)`
              → onAuthStateChange emits SIGNED_IN
                → AuthOrchestrator.runPostOAuth → register-device
                → AuthOrchestrator.runMergeCheck → link-identity

Without a real browser, the only way to walk this chain is **Playwright**.

## What to do

Add a Playwright suite under `tests/e2e/auth/` that:

  1. Spins up dev server (bun run dev) — or assumes it's already running.
  2. Opens chromium with `--use-fake-ui-for-media-stream` and persistent
     storage profile so the Supabase session cookie survives reloads.
  3. Goes to the game page, waits for the cloud-load ready event.
  4. Clicks "Sign in with Google".
  5. Supabase's hosted UI shows a real Google consent screen. Pre-
     configured test OAuth credentials (`GOOGLE_TEST_USER`,
     `GOOGLE_TEST_PASSWORD`) get typed in. The OAuth flow completes.
  6. After redirect back, asserts the AuthFloatingPanel is no longer
     showing the guest prompt — proving the new auth state took effect
     on the existing guest.
  7. Asserts server-side state: server_game_state exists for the new
     auth user_id (with the data the guest had), guest_identities row
     for the original device is superseded_by = new auth id.

A Playwright config for headless + headful modes lives at
`playwright.config.ts` (existing). One spec file per provider:

  tests/e2e/auth/google-oauth.test.ts
  tests/e2e/auth/github-oauth.test.ts

This is the right tool for the job. signInWithPassword shortcuts are
anti-patterns because they let a test pass while the OAuth wiring rots
in production.

## Why we can't fully rely on real OAuth from CI

This requires:
  - Google OAuth client_id + client_secret configured in Supabase's
    Authentication → Providers dashboard for project
    wkkzqtseqwcyyyezroqq.
  - A test Google Workspace + test user (Google requires consent test
    app, which has approval latency).
  - GitHub OAuth app with callback URL
    `https://wkkzqtseqwcyyyezroqq.supabase.co/auth/v1/callback`.
  - Test secrets in CI: `GOOGLE_TEST_USER`, `GOOGLE_TEST_PASSWORD`,
    `GITHUB_TEST_USER`, `GITHUB_TEST_PASSWORD`.

Setup cost: ~2 days of OAuth app approval. Until then, manually verified
once per staging deploy with a staging Google/GitHub test user.

## What's covered today (substitute tests)

The unit tests under `tests/api/auth/` already cover:
  - `confirm-link.test.ts` — auth-wins semantics with 7 mock users
  - `link-identity.test.ts` — conflict detection + idempotency
  - `callback.test.ts` — code-exchange error paths (mocked Supabase)

Plus `tests/integration/auth-flow/guest-startup.test.ts` covers the
anonymous half end-to-end at the HTTP layer.

What's not covered: "real Google click → real auth.users row →
real post-OAuth pipeline". That gap is exactly what Playwright should
fill.
