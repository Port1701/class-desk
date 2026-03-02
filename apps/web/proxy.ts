import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const protectedRoutes = ['/console'];
const authRoutes = ['/login'];

export const proxy = async (request: NextRequest) => {
  const { pathname } = request.nextUrl;

  // Skip session management for the OAuth callback — it handles its own cookies
  if (pathname.startsWith('/auth/callback')) {
    return NextResponse.next();
  }

  try {
    const { response, user } = await updateSession(request);

    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
    const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

    if (!user && isProtectedRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (user && isAuthRoute) {
      return NextResponse.redirect(new URL('/console', request.url));
    }

    return response;
  } catch (error) {
    console.error('[Proxy] Error:', error);
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }
};

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|public).*)'],
};
