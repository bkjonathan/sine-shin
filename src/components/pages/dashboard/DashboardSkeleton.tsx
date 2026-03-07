export default function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-glass-white" />
          <div>
            <div className="h-6 w-56 bg-glass-white rounded-lg mb-1.5" />
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-glass-white" />
      </div>

      <div className="glass-panel p-3.5 mb-4">
        <div className="flex items-center gap-2">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-6 w-16 bg-glass-white rounded-lg" />
          ))}
          <div className="w-px h-5 bg-glass-border mx-1" />
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-6 w-14 bg-glass-white rounded-lg" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {[...Array(5)].map((_, index) => (
          <div
            key={index}
            className="rounded-2xl p-4 bg-glass-white border border-glass-border"
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-xl bg-glass-white-hover" />
              <div className="h-3 w-16 bg-glass-white-hover rounded" />
            </div>
            <div className="h-6 w-24 bg-glass-white-hover rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 w-28 bg-glass-white-hover rounded" />
            <div className="h-3 w-14 bg-glass-white-hover rounded" />
          </div>
          {[...Array(5)].map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-glass-white-hover shrink-0" />
              <div className="flex-1">
                <div className="h-3.5 w-28 bg-glass-white-hover rounded mb-1" />
                <div className="h-2.5 w-16 bg-glass-white-hover rounded" />
              </div>
              <div className="h-3.5 w-20 bg-glass-white-hover rounded" />
              <div className="h-3 w-14 bg-glass-white-hover rounded" />
            </div>
          ))}
        </div>
        <div className="glass-panel p-5">
          <div className="h-4 w-24 bg-glass-white-hover rounded mb-4" />
          <div className="grid grid-cols-2 gap-2.5">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-glass-white border border-glass-border"
              >
                <div className="w-10 h-10 rounded-xl bg-glass-white-hover" />
                <div className="h-3 w-14 bg-glass-white-hover rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
