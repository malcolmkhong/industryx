export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
        <p className="text-sm text-muted-label">Loading admin panel...</p>
      </div>
    </div>
  );
}
