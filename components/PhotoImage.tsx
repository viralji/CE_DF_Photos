'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Loads photo from /api/photos/[id]/image with credentials so auth cookies
 * are always sent (avoids broken images when session is required).
 */
export function PhotoImage({
  photoId,
  alt = '',
  className,
}: {
  photoId: number;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `/api/photos/${photoId}/image`;
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setSrc(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setSrc(null);
    };
  }, [photoId]);

  if (failed) {
    return (
      <div
        className={className}
        style={{ background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Failed to load"
      >
        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={className}
        style={{ background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
