'use client';

import { signIn } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

export default function SignInPage() {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <Link href="/" className="inline-block mb-4">
              <Image src="/cloudextel-logo.svg" alt="CloudExtel" width={140} height={32} className="h-8 w-auto mx-auto" />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Welcome Back</h1>
            <p className="text-slate-600 text-sm mt-1">Sign in to access DF Photos</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <button
              onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
            >
              <svg className="w-5 h-5" viewBox="0 0 23 23" fill="currentColor">
                <path d="M0 0h10.45v10.45H0V0zm12.55 0H23v10.45H12.55V0zM0 12.55h10.45V23H0V12.55zm12.55 0H23V23H12.55V12.55z" />
              </svg>
              Sign in with Azure AD
            </button>

            {isDev && (
              <>
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-xs text-slate-500 text-center mb-2">Development</p>
                  <button
                    onClick={() => {
                      document.cookie = 'dev-bypass-auth=true; path=/; max-age=86400';
                      window.location.href = '/dashboard';
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600"
                  >
                    Bypass Authentication (Dev)
                  </button>
                </div>
              </>
            )}
          </div>

          <p className="text-center mt-6">
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-700">
              ← Back to Home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
