import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side route protection.
 *
 * Checks for accessToken + user cookies (set on login) and enforces
 * the same role-to-route mapping that Layout.tsx uses client-side.
 *
 * After deploying, existing users must log in once to establish cookies.
 */

// Routes that require owner role
const OWNER_ROUTES = ['/settings', '/users', '/stations', '/infrastructure']

// Routes that require supervisor or owner role
const SUPERVISOR_ROUTES = [
  '/daily-tank-reading',
  '/tank-movement',
  '/stock-movement',
  '/lpg-daily',
  '/lubricants-daily',
  '/inventory',
  '/sales',
  '/accounts',
  '/three-way-reconciliation',
  '/tank-analysis',
  '/reconciliation',
  '/reports',
  '/tank-readings-report',
  '/advanced-reports',
]

// Routes accessible to any authenticated user (all other non-public routes)
// No explicit list needed — any authenticated user can access them.

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets, API proxy, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // e.g. /favicon.ico, /images/logo.png
  ) {
    return NextResponse.next()
  }

  // Public routes — always accessible
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  // Check for auth cookie
  const token = request.cookies.get('accessToken')?.value
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Parse user cookie for role check
  const userCookie = request.cookies.get('user')?.value
  let role = ''
  if (userCookie) {
    try {
      const userData = JSON.parse(decodeURIComponent(userCookie))
      role = userData.role || ''
    } catch {
      // Corrupted cookie — force re-login
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('accessToken')
      response.cookies.delete('user')
      return response
    }
  }

  // Owner-only routes
  if (OWNER_ROUTES.includes(pathname) && role !== 'owner') {
    const homeUrl = new URL('/', request.url)
    homeUrl.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(homeUrl)
  }

  // Supervisor/owner routes
  if (SUPERVISOR_ROUTES.includes(pathname) && !['supervisor', 'owner'].includes(role)) {
    const homeUrl = new URL('/', request.url)
    homeUrl.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(homeUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except static files and API
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
