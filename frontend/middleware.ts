import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side route protection.
 *
 * Checks for accessToken + user cookies (set on login) and enforces
 * the same role-to-route mapping that Layout.tsx uses client-side.
 *
 * After deploying, existing users must log in once to establish cookies.
 */

// Routes that require owner role only
const OWNER_ROUTES = ['/stations', '/infrastructure']

// Routes that require manager or owner role
const MANAGER_ROUTES = ['/settings', '/users', '/audit', '/daily-close-off']

// Routes that require supervisor, manager, or owner role
const SUPERVISOR_ROUTES = [
  '/daily-tank-reading',
  '/fuel-operations',
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
  '/alerts',
  '/notifications',
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

  // Setup wizard enforcement — owners must complete setup before accessing any page
  const needsSetup = request.cookies.get('needsSetup')?.value === '1'

  if (pathname === '/initializing') {
    // Allow reverse initialization (logout animation) for any authenticated owner
    const direction = request.nextUrl.searchParams.get('direction')
    if (direction === 'reverse' && role === 'owner') {
      return NextResponse.next()
    }
    // Forward initialization only for owners who need setup
    if (role === 'owner' && needsSetup) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname === '/setup') {
    if (role === 'owner' && needsSetup) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (needsSetup && role === 'owner') {
    // Owner hasn't completed setup — force them to /initializing
    return NextResponse.redirect(new URL('/initializing', request.url))
  }

  // Attendants have a single workspace — send them straight to it (no dashboard).
  // Nav-only convenience: /my-shift is still freely accessible to them, and other
  // roles keep the dashboard. /my-shift is not redirected, so there's no loop.
  if (pathname === '/' && role === 'user') {
    return NextResponse.redirect(new URL('/my-shift', request.url))
  }

  // Owner-only routes
  if (OWNER_ROUTES.includes(pathname) && role !== 'owner') {
    const homeUrl = new URL('/', request.url)
    homeUrl.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(homeUrl)
  }

  // Manager/owner routes
  if (MANAGER_ROUTES.includes(pathname) && !['manager', 'owner'].includes(role)) {
    const homeUrl = new URL('/', request.url)
    homeUrl.searchParams.set('unauthorized', '1')
    return NextResponse.redirect(homeUrl)
  }

  // Supervisor/manager/owner routes
  if (SUPERVISOR_ROUTES.includes(pathname) && !['supervisor', 'manager', 'owner'].includes(role)) {
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
