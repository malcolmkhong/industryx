import { describe, expect, it } from 'vitest';

import { normalizeServerMarketNews } from '@/lib/hooks/useServerMarket';

describe('normalizeServerMarketNews', () => {
  it('maps persisted server market news into UI market news shape', () => {
    const news = normalizeServerMarketNews(
      [
        {
          id: 'market-42-0',
          title: 'Iron rallies',
          description: 'AI market report from server.',
          affectedResources: ['iron'],
          impactSummary: 'iron +12.0%',
          severity: 'high',
          category: 'price_move',
          textSource: 'llm',
          gameTick: 42,
        },
      ],
      42,
    );

    expect(news).toEqual([
      {
        id: 'market-42-0',
        title: 'Iron rallies',
        description: 'AI market report from server.',
        affectedResources: ['iron'],
        impactSummary: 'iron +12.0%',
        severity: 'high',
        category: 'price_move',
        textSource: 'llm',
        gameTick: 42,
      },
    ]);
  });
});
