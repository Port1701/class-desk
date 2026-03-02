import { type CookieOptions, createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const GET = async (request: NextRequest) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', requestUrl.origin));
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      return NextResponse.redirect(new URL('/login?error=Configuration error', requestUrl.origin));
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // Ignored when called from a Server Component;
            // middleware handles cookie updates.
          }
        },
      },
    });

    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin),
      );
    }

    // Verify the user is an admin before granting access (fail-closed)
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`,
          requestUrl.origin,
        ),
      );
    }

    const checkRes = await fetch(`${API_BASE_URL}/admin-emails/check`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!checkRes.ok) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent('Unable to verify access. Please try again.')}`,
          requestUrl.origin,
        ),
      );
    }

    const { isAdmin } = await checkRes.json();

    if (!isAdmin) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent('Access denied. Your account is not authorized.')}`,
          requestUrl.origin,
        ),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, requestUrl.origin),
    );
  }

  return NextResponse.redirect(new URL('/console', requestUrl.origin));
};
