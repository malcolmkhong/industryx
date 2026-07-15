// ============================================
// INDUSTRIAX: Dynamic Config Cache
// Compatibility barrel for the runtime config cache.
//
// Mutable live bindings are owned by runtimeCache.ts.
// Keep this file as the existing public import path until callers migrate.
// ============================================

export * from "./runtimeCache";
