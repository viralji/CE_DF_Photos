'use client';

import Link from 'next/link';
import Image from 'next/image';
import QuestionsSuggestionsPanel from '@/components/QuestionsSuggestionsPanel';

export default function FeedbackPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Image src="/cloudextel-logo.svg" alt="CloudExtel" width={120} height={28} className="h-7 w-auto" />
            <span className="text-sm font-semibold text-slate-800 truncate">Questions & Suggestions</span>
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-slate-600 hover:text-slate-900 font-medium"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <QuestionsSuggestionsPanel />
      </main>
    </div>
  );
}
