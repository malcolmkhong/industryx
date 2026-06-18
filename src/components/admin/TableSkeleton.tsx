/* eslint-disable jsx-a11y/control-has-associated-label */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-muted-label/40" aria-label="Loading table" role="status">
      <table className="w-full">
        <thead>
          <tr className="border-b border-muted-label/40">
            {Array.from({ length: cols }, (_, i) => (
              <th scope="col" key={`head-${i}`} className="px-4 py-2.5">
                <div className="h-3 bg-background/60 rounded w-16 animate-pulse" aria-hidden="true" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={`row-${r}`} className="border-b border-muted-label/40/60 last:border-0">
              {Array.from({ length: cols }, (_, c) => (
                <td key={`cell-${r}-${c}`} className="px-4 py-3">
                  <div
                    className="h-3 bg-background/60 rounded animate-pulse"
                    style={{ width: `${40 + Math.random() * 40}%` }}
                    aria-hidden="true"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
