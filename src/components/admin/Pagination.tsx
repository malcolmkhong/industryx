'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible + 2) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-zinc-500">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1.5 text-xs text-zinc-600">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={[
                'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors',
                p === page
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50',
              ].join(' ')}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
