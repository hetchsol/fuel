interface PaginationProps {
  total: number
  pageSize: number
  page: number
  onPageChange: (page: number) => void
}

export default function Pagination({ total, pageSize, page, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  const range = new Set(
    [1, totalPages, page, page - 1, page + 1].filter(p => p >= 1 && p <= totalPages)
  )
  const sorted = Array.from(range).sort((a, b) => a - b)
  const pages: (number | '...')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push('...')
    pages.push(sorted[i])
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
      <span className="text-xs text-content-secondary">
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 text-sm rounded border border-surface-border text-content-secondary hover:bg-surface-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-content-secondary text-sm select-none">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`min-w-[2rem] px-2 py-1 text-sm rounded border ${
                p === page
                  ? 'bg-action-primary text-white border-action-primary'
                  : 'border-surface-border text-content-secondary hover:bg-surface-bg'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-2 py-1 text-sm rounded border border-surface-border text-content-secondary hover:bg-surface-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}
