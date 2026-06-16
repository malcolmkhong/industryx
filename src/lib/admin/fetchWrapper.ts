function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? match[1] : null;
}

interface FetchOptions extends RequestInit {
  csrf?: boolean;
}

export async function adminFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { csrf = true, headers: initHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(initHeaders as Record<string, string> | undefined),
  };

  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET')) {
    const token = getCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  return fetch(url, { ...rest, headers });
}
