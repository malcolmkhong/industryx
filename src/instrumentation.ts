export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = async (
  error: { digest: string } & Error,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string }
) => {
  const { captureRequestError } = await import('@sentry/nextjs');
  captureRequestError(error, request, context);
};
