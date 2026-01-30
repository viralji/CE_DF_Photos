'use client';

import { useState } from 'react';

const API_IMAGE_URL = (id: number) => `/api/photos/${id}/image`;

/**
 * Renders a photo from the API. Uses direct img src so the browser sends
 * cookies for the same-origin request (required for auth).
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
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const src = API_IMAGE_URL(photoId);

  if (failed) {
    return (
      <div
        className={className}
        style={{ background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}
        title="Failed to load image"
      >
        <div className="text-center text-slate-500 text-sm p-2">
          <svg className="w-10 h-10 mx-auto text-slate-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Image could not be loaded. Try signing in again.
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={{ position: 'relative', minHeight: 120 }}>
      {!loaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={className}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          display: 'block',
          position: loaded ? 'relative' : 'absolute',
          opacity: loaded ? 1 : 0,
        }}
      />
    </div>
  );
}
