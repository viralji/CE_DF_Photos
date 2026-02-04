export default function ReviewLoading() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 text-sm font-medium">Loading Review…</p>
        </div>
      </main>
    </div>
  );
}
