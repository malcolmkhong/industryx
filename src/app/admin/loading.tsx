export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Loading admin panel...</p>
      </div>
    </div>
  );
}
