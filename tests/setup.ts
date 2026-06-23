// tests/setup.ts
// Vitest setup — runs before every test file.
//
// Required env vars to import game state validator and other
// fail-closed modules without throwing at module-evaluation time.

process.env.CHECKSUM_SECRET ??= 'test-checksum-secret-not-real-just-for-vitest';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
