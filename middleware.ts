import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment && !token) {
      const devBypass = req.cookies.get('dev-bypass-auth')?.value === 'true';
      if (devBypass) return NextResponse.next();
    }

    if (!token) {
      const isPublic =
        pathname.startsWith('/icon-') ||
        pathname === '/apple-touch-icon.png' ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/auth') ||
        pathname === '/' ||
        pathname.startsWith('/signin');
      if (isPublic) return NextResponse.next();
      return NextResponse.redirect(new URL('/signin', req.url));
    }

    if (pathname === '/') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        const isDevelopment = process.env.NODE_ENV === 'development';
        const isPublic =
          pathname.startsWith('/icon-') ||
          pathname === '/apple-touch-icon.png' ||
          pathname.startsWith('/_next/') ||
          pathname.startsWith('/api/auth') ||
          pathname === '/' ||
          pathname.startsWith('/signin');
        if (isPublic) return true;
        if (isDevelopment && !token) {
          if (req.cookies.get('dev-bypass-auth')?.value === 'true') return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest|manifest.json|manifest.webmanifest|sw.js|icon-|apple-touch-icon).*)',
  ],
};
