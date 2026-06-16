export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            {Array.from({ length: cols }, (_, i) => (
              <th key={`head-${i}`} className="px-4 py-2.5">
                <div className="h-3 bg-zinc-800 rounded w-16 animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={`row-${r}`} className="border-b border-zinc-800/60 last:border-0">
              {Array.from({ length: cols }, (_, c) => (
                <td key={`cell-${r}-${c}`} className="px-4 py-3">
                  <div
                    className="h-3 bg-zinc-800 rounded animate-pulse"
                    style={{ width: `${40 + Math.random() * 40}%` }}
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
