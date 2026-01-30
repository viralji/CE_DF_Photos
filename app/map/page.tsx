'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import 'leaflet/dist/leaflet.css';

async function getRoutes() {
  const res = await fetch('/api/routes');
  if (!res.ok) throw new Error('Failed to fetch routes');
  return res.json();
}

async function getPhotosByRoute(routeId: string) {
  const params = new URLSearchParams({ routeId, limit: '500' });
  const res = await fetch(`/api/photos?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  return res.json();
}

function distSq(
  a: { latitude?: number | null; longitude?: number | null },
  b: { latitude?: number | null; longitude?: number | null }
): number {
  const dlat = (b.latitude ?? 0) - (a.latitude ?? 0);
  const dlon = (b.longitude ?? 0) - (a.longitude ?? 0);
  return dlat * dlat + dlon * dlon;
}

/**
 * Order points so the line follows geographic proximity: start from one "end"
 * of the chain (one of the two farthest points), then always go to nearest
 * unvisited point. This avoids crossing lines from an arbitrary start.
 */
function orderPhotosByNearestNeighbor<T extends { latitude?: number | null; longitude?: number | null }>(photos: T[]): T[] {
  if (photos.length <= 1) return [...photos];
  if (photos.length === 2) return [...photos];

  let maxDistSq = -1;
  let startIdx = 0;
  let endIdx = 0;
  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      const d = distSq(photos[i], photos[j]);
      if (d > maxDistSq) {
        maxDistSq = d;
        startIdx = i;
        endIdx = j;
      }
    }
  }

  const result: T[] = [photos[startIdx]];
  const indices = new Set(photos.map((_, i) => i));
  indices.delete(startIdx);
  let currentIdx = startIdx;

  while (indices.size > 0) {
    let nearestIdx = -1;
    let nearestDistSq = Infinity;
    const current = photos[currentIdx];
    for (const idx of indices) {
      const d = distSq(current, photos[idx]);
      if (d < nearestDistSq) {
        nearestDistSq = d;
        nearestIdx = idx;
      }
    }
    result.push(photos[nearestIdx]);
    indices.delete(nearestIdx);
    currentIdx = nearestIdx;
  }
  return result;
}

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const polylineLayerRef = useRef<unknown>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | ''>('');
  const [mounted, setMounted] = useState(false);

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: photosData, isLoading } = useQuery({
    queryKey: ['photos-map', selectedRouteId],
    queryFn: () => getPhotosByRoute(selectedRouteId),
    enabled: !!selectedRouteId,
  });

  const routeOptions = useMemo(() => {
    const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];
    return routes.map((r) => ({ value: String(r.route_id), label: r.route_name ?? String(r.route_id) }));
  }, [routesData]);

  const photosWithLocation = useMemo(() => {
    const photos = (photosData?.photos ?? []) as { latitude?: number; longitude?: number; id: number; filename?: string; checkpoint_name?: string; entity?: string; execution_stage?: string; status?: string }[];
    return photos.filter((p) => p.latitude != null && p.longitude != null);
  }, [photosData]);

  const sortedForLine = useMemo(() => orderPhotosByNearestNeighbor(photosWithLocation), [photosWithLocation]);
  const latLngs = useMemo(
    () => sortedForLine.map((p) => [p.latitude!, p.longitude!] as [number, number]),
    [sortedForLine]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import('leaflet').then((L) => {
      if (!mapRef.current) return;
      const Leaflet = L.default;
      if (!mapInstanceRef.current) {
        (mapInstanceRef as React.MutableRefObject<L.Map | null>).current = Leaflet.map(mapRef.current).setView([20.5937, 78.9629], 5);
        Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapInstanceRef.current as L.Map);
      }
      const map = mapInstanceRef.current as L.Map;
      map.eachLayer((layer: unknown) => {
        if (layer instanceof Leaflet.Marker || layer instanceof Leaflet.Polyline) {
          map.removeLayer(layer as L.Layer);
        }
      });
      if (polylineLayerRef.current) {
        try {
          map.removeLayer(polylineLayerRef.current as L.Layer);
        } catch {
          // ignore
        }
        polylineLayerRef.current = null;
      }
      if (!selectedRouteId || !photosWithLocation.length) return;
      if (latLngs.length >= 2) {
        const polyline = Leaflet.polyline(latLngs, { color: '#2563eb', weight: 4, opacity: 0.8 }).addTo(map);
        polylineLayerRef.current = polyline;
      }
      photosWithLocation.forEach((photo: { latitude?: number; longitude?: number; id: number; filename?: string; checkpoint_name?: string; entity?: string; execution_stage?: string; status?: string }) => {
        if (photo.latitude == null || photo.longitude == null) return;
        const imageUrl = `/api/photos/${photo.id}/image`;
        const viewFullUrl = `/view-photo/${photo.id}`;
        Leaflet.marker([photo.latitude, photo.longitude])
          .addTo(map)
          .bindPopup(
            `<div style="min-width: 200px;">
              <a href="${viewFullUrl}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="" style="width: 200px; height: 200px; object-fit: cover;" /></a>
              <a href="${viewFullUrl}" target="_blank" rel="noopener noreferrer">View full size</a>
              <p><strong>${(photo.checkpoint_name || '').replace(/</g, '&lt;')}</strong></p>
              <p>${(photo.entity || '').replace(/</g, '&lt;')} - ${(photo.execution_stage || '').replace(/</g, '&lt;')}</p>
              <p>Status: ${(photo.status || '').replace(/</g, '&lt;')}</p>
            </div>`
          );
      });
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 16);
      } else if (latLngs.length > 1) {
        map.fitBounds(Leaflet.latLngBounds(latLngs), { padding: [40, 40], maxZoom: 16 });
      }
    });
  }, [selectedRouteId, photosWithLocation, latLngs]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as L.Map).remove();
        mapInstanceRef.current = null;
      }
      polylineLayerRef.current = null;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex-shrink-0 border-b border-slate-200 bg-white sticky top-0 z-[1000]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-800"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></Link>
          <h1 className="text-lg font-bold text-slate-900">Map</h1>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600 shrink-0">Route</label>
          <SearchableSelect
            options={routeOptions}
            value={selectedRouteId}
            onChange={(v) => setSelectedRouteId(v === '' ? '' : String(v))}
            placeholder="Select route"
            className="min-w-[180px]"
          />
          {selectedRouteId && (
            <span className="text-slate-500 text-xs">{isLoading ? 'Loading…' : `${photosWithLocation.length} photo(s)`}</span>
          )}
        </div>
        {!selectedRouteId && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm mb-4">
            Select a route to see photos on the map.
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div ref={mapRef} className="w-full h-[calc(100vh-220px)] min-h-[300px]" />
        </div>
      </main>
    </div>
  );
}
