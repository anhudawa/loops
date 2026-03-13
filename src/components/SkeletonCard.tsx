export default function SkeletonCard() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Cover image placeholder */}
      <div
        className="aspect-[3/1] md:aspect-[21/9]"
        style={{ background: "var(--bg-raised)" }}
      />

      {/* Content */}
      <div className="p-2.5 md:p-4">
        {/* Mobile: location + creator placeholder */}
        <div className="md:hidden">
          <div className="flex items-center justify-between">
            <div className="skeleton h-3 rounded w-24" />
            <div className="flex items-center gap-1.5">
              <div className="skeleton w-4 h-4 rounded-full" />
              <div className="skeleton h-3 rounded w-16" />
            </div>
          </div>
        </div>

        {/* Desktop: full content placeholder */}
        <div className="hidden md:block">
          {/* Title row */}
          <div className="flex items-center gap-1.5 mb-1">
            <div className="skeleton h-5 rounded w-48" />
          </div>

          {/* Description lines */}
          <div className="skeleton h-3.5 rounded w-full mb-1.5" />
          <div className="skeleton h-3.5 rounded w-2/3 mb-3" />

          {/* Stats row */}
          <div className="flex items-center gap-3">
            <div className="skeleton h-3 rounded w-14" />
            <div className="skeleton h-3 rounded w-16" />
            <div className="skeleton h-3 rounded w-14" />
            <div className="skeleton h-3 rounded w-20" />
          </div>

          {/* Creator row */}
          <div
            className="flex items-center gap-2 mt-3 pt-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="skeleton w-5 h-5 rounded-full" />
            <div className="skeleton h-3 rounded w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
