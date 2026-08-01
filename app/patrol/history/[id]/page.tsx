'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PatrolPhotoLightbox } from '@/components/patrol/PatrolPhotoLightbox';
import {
  PHOTO_LOCATION_PIN_CLASS_NAME,
  PHOTO_LOCATION_PIN_ICON_ANCHOR,
  PHOTO_LOCATION_PIN_ICON_SIZE,
  photoLocationPinIconHtml,
} from '@/lib/leaflet-photo-pin';
import 'leaflet/dist/leaflet.css';

interface PatrolSession {
  id: number;
  route_id: string;
  route_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_distance_meters: number;
  photo_count: number;
  flag_count: number;
}

interface Ping {
  latitude: number;
  longitude: number;
  cumulative_distance: number;
  recorded_at: string;
}

interface PatrolPhoto {
  id: number;
  s3_url: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  created_at: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

interface PatrolFlag {
  id: number;
  severity: string;
  description: string;
  latitude: number;
  longitude: number;
  s3_url: string | null;
  created_at: string;
}

function flagSvg(severity: string) {
  const c = severity === 'high' ? '#dc2626' : severity === 'medium' ? '#ea580c' : '#ca8a04';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="${c}"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

export default function PatrolHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<PatrolSession | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [photos, setPhotos] = useState<PatrolPhoto[]>([]);
  const [flags, setFlags] = useState<PatrolFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapInitialized, setMapInitialized] = useState(false);
  const [lightbox, setLightbox] = useState<{
    imageUrl: string;
    title?: string;
    subtitle?: string;
    openInNewTabHref?: string | null;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'photos' | 'flags'>('photos');

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const trailRef = useRef<unknown>(null);
  const photoMarkersRef = useRef<unknown[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/patrol/sessions/${id}`).then(r => r.json()),
      fetch(`/api/patrol/sessions/${id}/ping`).then(r => r.json()),
      fetch(`/api/patrol/sessions/${id}/photos`).then(r => r.json()),
      fetch(`/api/patrol/sessions/${id}/flags`).then(r => r.json()).catch(() => ({ flags: [] })),
    ]).then(([sessionData, pingsData, photosData, flagsData]) => {
      if (sessionData.error) { setError(sessionData.error); return; }
      setSession(sessionData.session);
      setPings(pingsData.pings ?? []);
      setPhotos(photosData.photos ?? []);
      setFlags(flagsData.flags ?? []);
    }).catch(() => setError('Failed to load session data'))
      .finally(() => setLoading(false));
  }, [id]);

  // Map init — map div always rendered so this works on first mount
  useEffect(() => {
    if (!mapRef.current || mapInitialized) return;
    let destroyed = false;
    import('leaflet').then((L) => {
      if (destroyed || !mapRef.current) return;
      // @ts-expect-error leaflet icon fix
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconUrl: '/leaflet/marker-icon.png',
        iconRetinaUrl: '/leaflet/marker-icon-2x.png',
        shadowUrl: '/leaflet/marker-shadow.png',
      });
      const map = L.default.map(mapRef.current, { zoomControl: true, attributionControl: false });
      L.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      map.setView([20.5937, 78.9629], 5);
      mapInstanceRef.current = map;
      setMapInitialized(true);
    });
    return () => { destroyed = true; };
  }, [mapInitialized]);

  // Draw trail + photo markers when map ready or data changes
  useEffect(() => {
    if (!mapInitialized || !mapInstanceRef.current) return;
    if (pings.length === 0 && photos.length === 0 && flags.length === 0) return;

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current as ReturnType<typeof L.default.map>;

      if (trailRef.current) { (trailRef.current as ReturnType<typeof L.default.polyline>).remove(); trailRef.current = null; }
      for (const m of photoMarkersRef.current) (m as ReturnType<typeof L.default.marker>).remove();
      photoMarkersRef.current = [];

      if (pings.length > 1) {
        const coords = pings.map(p => [p.latitude, p.longitude] as [number, number]);
        trailRef.current = L.default.polyline(coords, { color: '#2563eb', weight: 4, opacity: 0.7 }).addTo(map);
      }

      const PIN_COLOR = '#2563eb';
      for (const photo of photos) {
        const icon = L.default.divIcon({
          className: PHOTO_LOCATION_PIN_CLASS_NAME,
          html: photoLocationPinIconHtml(PIN_COLOR, 'Patrol photo'),
          iconSize: [...PHOTO_LOCATION_PIN_ICON_SIZE],
          iconAnchor: [...PHOTO_LOCATION_PIN_ICON_ANCHOR],
        });
        const thumbUrl = `/api/patrol/photos/${photo.id}/image`;
        const timeStr = new Date(photo.created_at).toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
        });
        const routeLabel = escapeHtml(session?.route_name ?? session?.route_id ?? 'Patrol');
        const marker = L.default.marker([photo.latitude, photo.longitude], { icon })
          .addTo(map)
          .bindTooltip(escapeHtml(timeStr), { permanent: false })
          .bindPopup(
            `<div style="min-width:200px;">
              <a href="${thumbUrl}" target="_blank" rel="noopener noreferrer"><img src="${thumbUrl}" alt="" style="width:200px;height:200px;object-fit:cover;display:block;border-radius:4px;" /></a>
              <p style="margin:8px 0 0;font-size:12px;"><strong>${routeLabel}</strong></p>
              <p style="margin:4px 0 0;font-size:11px;color:#64748b;">${escapeHtml(timeStr)}</p>
              <p style="margin:6px 0 0;font-size:11px;"><a href="${thumbUrl}" target="_blank" rel="noopener noreferrer">Open full size</a></p>
            </div>`,
            { maxWidth: 240 }
          );
        photoMarkersRef.current.push(marker);
      }

      for (const flag of flags) {
        const icon = L.default.divIcon({ html: flagSvg(flag.severity), iconSize: [22, 22], iconAnchor: [4, 22], className: '' });
        const descPreview = escapeHtml(flag.description.slice(0, 60));
        const marker = L.default.marker([flag.latitude, flag.longitude], { icon })
          .addTo(map)
          .bindTooltip(`<b>${flag.severity.toUpperCase()}</b><br><span style="font-size:11px">${descPreview}</span>`, { permanent: false });
        if (flag.s3_url) {
          const flagImg = `/api/patrol/flags/${flag.id}/image`;
          marker.on('click', () =>
            setLightbox({
              imageUrl: flagImg,
              title: `Flag · ${flag.severity}`,
              subtitle: flag.description.slice(0, 120),
              openInNewTabHref: flagImg,
            })
          );
        }
        photoMarkersRef.current.push(marker);
      }

      const allCoords: [number, number][] = [
        ...pings.map(p => [p.latitude, p.longitude] as [number, number]),
        ...photos.map(p => [p.latitude, p.longitude] as [number, number]),
        ...flags.map((f) => [f.latitude, f.longitude] as [number, number]),
      ];
      if (allCoords.length > 0) map.fitBounds(allCoords, { padding: [40, 40], maxZoom: 16 });
    });
  }, [mapInitialized, pings, photos, flags, session?.route_id, session?.route_name]);

  const fmtDuration = () => {
    if (!session?.started_at || !session?.ended_at) return null;
    const mins = Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-hidden">
      {/* Loading / error overlay */}
      {(loading || (!loading && error)) && (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center gap-4">
          {loading
            ? <p className="text-slate-400 text-sm">Loading patrol history…</p>
            : <>
                <p className="text-red-400 text-sm">{error}</p>
                <button onClick={() => router.push('/patrol')} className="text-blue-400 text-sm underline">Back to Patrol</button>
              </>
          }
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-800 text-white px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => router.push('/patrol')} className="text-slate-300 hover:text-white flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{session?.route_name ?? session?.route_id ?? '…'}</p>
          <p className="text-xs text-slate-400">
            {session
              ? new Date(session.started_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })
              : '…'}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0 ${
          session?.status === 'completed' ? 'bg-blue-100 text-blue-800' : 'bg-slate-600 text-slate-300'
        }`}>
          {session?.status ?? '…'}
        </span>
      </header>

      {/* Stats bar */}
      <div className="bg-slate-700 text-white px-4 py-2 flex gap-5 text-sm flex-shrink-0">
        <span className="flex flex-col items-center">
          <span className="font-bold">{((session?.total_distance_meters ?? 0) / 1000).toFixed(2)}</span>
          <span className="text-xs text-slate-400">km</span>
        </span>
        <span className="flex flex-col items-center">
          <span className="font-bold">{session?.photo_count ?? 0}</span>
          <span className="text-xs text-slate-400">photos</span>
        </span>
        <span className="flex flex-col items-center">
          <span className="font-bold">{session?.flag_count ?? 0}</span>
          <span className="text-xs text-slate-400">flags</span>
        </span>
        {fmtDuration() && (
          <span className="flex flex-col items-center">
            <span className="font-bold">{fmtDuration()}</span>
            <span className="text-xs text-slate-400">duration</span>
          </span>
        )}
        {session?.started_at && (
          <span className="ml-auto text-xs text-slate-400 self-center">
            {new Date(session.started_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
            {session.ended_at && ` → ${new Date(session.ended_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`}
          </span>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1 z-0">
        <div ref={mapRef} className="absolute inset-0" />
        {!loading && (photos.length > 0 || flags.length > 0) && (
          <div className="absolute top-2 left-2 z-[500] flex gap-1.5">
            {photos.length > 0 && (
              <span className="bg-blue-600/90 text-white text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">
                📷 {photos.length}
              </span>
            )}
            {flags.length > 0 && (
              <span className="bg-red-600/90 text-white text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">
                🚩 {flags.length}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom gallery */}
      {(photos.length > 0 || flags.length > 0) && !loading && (
        <div className="bg-slate-800 flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-slate-700 px-3">
            <button
              onClick={() => setActiveTab('photos')}
              className={`py-2 text-xs font-semibold mr-4 ${activeTab === 'photos' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400'}`}
            >
              📷 Photos ({photos.length})
            </button>
            {flags.length > 0 && (
              <button
                onClick={() => setActiveTab('flags')}
                className={`py-2 text-xs font-semibold ${activeTab === 'flags' ? 'text-red-400 border-b-2 border-red-400' : 'text-slate-400'}`}
              >
                🚩 Flags ({flags.length})
              </button>
            )}
          </div>

          {/* Photo strip */}
          {activeTab === 'photos' && (
            <div className="flex gap-2 px-3 py-2 overflow-x-auto" style={{ minHeight: '88px' }}>
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => {
                    const timeStr = new Date(photo.created_at).toLocaleTimeString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const acc = photo.accuracy != null ? ` · GPS ±${Number(photo.accuracy).toFixed(0)}m` : '';
                    setLightbox({
                      imageUrl: `/api/patrol/photos/${photo.id}/image`,
                      title: session?.route_name ?? session?.route_id ?? 'Patrol photo',
                      subtitle: `${timeStr}${acc}`,
                      openInNewTabHref: `/api/patrol/photos/${photo.id}/image`,
                    });
                  }}
                  className="flex-shrink-0 relative w-20 h-20 rounded-lg overflow-hidden border-2 border-slate-600 hover:border-blue-400 transition-colors group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/patrol/photos/${photo.id}/image`} alt="patrol" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-xl">👁</span>
                  </div>
                  <p className="absolute bottom-0 left-0 right-0 text-center text-white text-xs bg-black/50 py-0.5">
                    {new Date(photo.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Flag strip */}
          {activeTab === 'flags' && (
            <div className="flex gap-2 px-3 py-2 overflow-x-auto" style={{ minHeight: '88px' }}>
              {flags.map((flag) => (
                <div key={flag.id} className="flex-shrink-0 flex gap-1.5 bg-slate-700 rounded-lg overflow-hidden border-2 border-slate-600" style={{ minWidth: '180px', maxWidth: '240px' }}>
                  {flag.s3_url && (
                    <button
                      onClick={() => {
                        const flagImg = `/api/patrol/flags/${flag.id}/image`;
                        setLightbox({
                          imageUrl: flagImg,
                          title: `Flag · ${flag.severity}`,
                          subtitle: flag.description.slice(0, 120),
                          openInNewTabHref: flagImg,
                        });
                      }}
                      className="relative w-20 h-20 flex-shrink-0 group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/patrol/flags/${flag.id}/image`} alt="flag" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white text-xl">👁</span>
                      </div>
                    </button>
                  )}
                  <div className="flex flex-col justify-between py-1.5 px-2 min-w-0">
                    <div>
                      <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${flag.severity === 'high' ? 'bg-red-600 text-white' : flag.severity === 'medium' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-white'}`}>
                        {flag.severity}
                      </span>
                      <p className="text-white text-xs mt-1 line-clamp-2">{flag.description}</p>
                    </div>
                    <p className="text-slate-400 text-xs">{new Date(flag.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <PatrolPhotoLightbox
          imageUrl={lightbox.imageUrl}
          title={lightbox.title}
          subtitle={lightbox.subtitle}
          openInNewTabHref={lightbox.openInNewTabHref}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
