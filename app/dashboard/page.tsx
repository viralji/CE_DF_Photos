'use client';

import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';

async function getPhotoCount() {
  const res = await fetch('/api/photos?limit=500', { credentials: 'include' });
  if (!res.ok) return { count: 0 };
  const data = await res.json();
  return { count: data.photos?.length ?? 0 };
}

const iconSvg = (paths: string[]) => (
  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}>
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const cards = [
  { href: '/capture', title: 'Capture', desc: 'Take geo-tagged photos', color: 'bg-blue-500', icon: iconSvg(['M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z', 'M15 13a3 3 0 11-6 0 3 3 0 016 0z', 'M19 10a7 7 0 01-7 7h-4a7 7 0 01-7-7']) },
  { href: '/review', title: 'Review', desc: 'Approve or reject photos', color: 'bg-green-500', icon: iconSvg(['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4']) },
  { href: '/gallery', title: 'Gallery', desc: 'Browse all photos', color: 'bg-purple-500', icon: iconSvg(['M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z']) },
  { href: '/map', title: 'Map', desc: 'Location view', color: 'bg-orange-500', icon: iconSvg(['M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7']) },
  { href: '/reports', title: 'Reports', desc: 'Download reports', color: 'bg-indigo-500', icon: iconSvg(['M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z']) },
  { href: '/admin', title: 'Admin', desc: 'Manage routes', color: 'bg-slate-500', icon: iconSvg(['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z']) },
];

export default function DashboardPage() {
  const { data } = useQuery({ queryKey: ['photo-count'], queryFn: getPhotoCount });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <Image src="/cloudextel-logo.svg" alt="CloudExtel" width={120} height={28} className="h-7 w-auto" />
            <span className="text-sm font-semibold text-slate-800 truncate">Dashboard</span>
          </Link>
          {data != null && (
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold" title={`${data.count} photos`}>
              {data.count}
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="bg-white border border-slate-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className={`w-9 h-9 rounded-lg ${c.color} flex items-center justify-center mb-2`}>
                {c.icon}
              </div>
              <h3 className="font-semibold text-slate-800 text-sm">{c.title}</h3>
              <p className="text-xs text-slate-600 mt-0.5">{c.desc}</p>
            </Link>
          ))}
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-2">Quick Tips</h3>
          <ul className="text-xs text-slate-600 space-y-1">
            <li>• Enable location access for geo-tagging</li>
            <li>• Use the map view to see project coverage</li>
            <li>• Review pending photos regularly</li>
          </ul>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/signin' })}
            className="mt-4 w-full py-2.5 px-4 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </main>
    </div>
  );
}
