// ============================================
// FACTORY DOMINION: NEWS ID GENERATOR
// Split from newsBuilder.ts — logic only, no template data moved.
// ============================================

export function generateNewsId(): string {
  return 'nws-' + Math.random().toString(36).substring(2, 8);
}
