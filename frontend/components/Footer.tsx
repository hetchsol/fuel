import Link from 'next/link'

export default function Footer({ userRole }: { userRole?: string }) {
  return (
    <footer className="mt-auto border-t border-white/[0.06]" style={{ background: 'rgba(8, 20, 40, 0.8)', backdropFilter: 'blur(12px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-action-primary/15 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-content-primary/80">NextStop</span>
            <span className="text-xs text-content-secondary/40 ml-1">v1.0</span>
          </div>

          {/* Quick links — hidden for attendant role */}
          {userRole !== 'user' && (
          <div className="flex items-center gap-6 text-xs text-content-secondary/60">
            <Link href="/" className="hover:text-content-primary transition-colors">Dashboard</Link>
            <Link href="/my-shift" className="hover:text-content-primary transition-colors">My Shift</Link>
            <Link href="/reports" className="hover:text-content-primary transition-colors">Reports</Link>
          </div>
          )}

          {/* Copyright */}
          <div className="text-right">
            <p className="text-xs text-content-secondary/40">
              &copy; {new Date().getFullYear()} NextStop. All rights reserved.
            </p>
            <p className="text-[10px] text-content-secondary/10 mt-0.5">
              Developed by Hetch Solutions
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
