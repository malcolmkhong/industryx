export function actionTimingHeaders(startedAt: number): HeadersInit {
  return {
    "Server-Timing": `action;dur=${Date.now() - startedAt}`,
  };
}
