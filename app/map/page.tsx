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

async function getPhotosForMap(routeId: string, subsectionId?: string) {
  const params = new URLSearchParams({ routeId, limit: '500' });
  if (subsectionId) params.set('subsectionId', subsectionId);
  const res = await fetch(`/api/photos?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch photos');
  return res.json();
}

async function getSubsections(routeId: string) {
  const res = await fetch(`/api/subsections?route_id=${encodeURIComponent(routeId)}`);
  if (!res.ok) throw new Error('Failed to fetch subsections');
  return res.json();
}

async function getEntities() {
  const res = await fetch('/api/entities');
  if (!res.ok) throw new Error('Failed to fetch entities');
  return res.json();
}

const ENTITY_PALETTE = [
  '#2563eb', '#16a34a', '#dc2626', '#ea580c', '#9333ea', '#0d9488', '#ca8a04', '#db2777', '#4f46e5', '#0891b2', '#65a30d', '#c2410c',
];
const ENTITY_FALLBACK_COLOR = '#64748b';

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
  const [selectedSubsectionId, setSelectedSubsectionId] = useState<string | ''>('');
  const [entityFilterMode, setEntityFilterMode] = useState<'all' | 'multiple'>('all');
  const [selectedEntityNames, setSelectedEntityNames] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  const { data: routesData } = useQuery({ queryKey: ['routes'], queryFn: getRoutes });
  const { data: subsectionsData } = useQuery({
    queryKey: ['subsections', selectedRouteId],
    queryFn: () => getSubsections(selectedRouteId),
    enabled: !!selectedRouteId,
  });
  const { data: entitiesData } = useQuery({ queryKey: ['entities'], queryFn: getEntities });
  const { data: photosData, isLoading } = useQuery({
    queryKey: ['photos-map', selectedRouteId, selectedSubsectionId || null],
    queryFn: () =>
      getPhotosForMap(selectedRouteId, selectedSubsectionId || undefined),
    enabled: !!selectedRouteId,
  });

  const routeOptions = useMemo(() => {
    const routes = (routesData?.routes ?? []) as { route_id: string; route_name?: string }[];
    return routes.map((r) => ({ value: String(r.route_id), label: r.route_name ?? String(r.route_id) }));
  }, [routesData]);

  const subsectionOptions = useMemo(() => {
    const subsections = (subsectionsData?.subsections ?? []) as { subsection_id: string; subsection_name?: string }[];
    return [{ value: '', label: 'All subsections' }, ...subsections.map((s) => ({ value: String(s.subsection_id), label: s.subsection_name ?? String(s.subsection_id) }))];
  }, [subsectionsData]);

  const entityList = useMemo(() => {
    const entities = (entitiesData?.entities ?? []) as { id: number; name: string; code?: string }[];
    return entities.map((e) => (e.name ?? '').trim()).filter(Boolean);
  }, [entitiesData]);

  const photosWithLocation = useMemo(() => {
    const photos = (photosData?.photos ?? []) as { latitude?: number; longitude?: number; id: number; filename?: string; checkpoint_name?: string; entity?: string; execution_stage?: string; status?: string }[];
    let filtered = photos.filter((p) => p.latitude != null && p.longitude != null);
    if (entityFilterMode === 'multiple' && selectedEntityNames.size > 0) {
      filtered = filtered.filter((p) => selectedEntityNames.has((p.entity ?? '').trim()));
    }
    return filtered;
  }, [photosData, entityFilterMode, selectedEntityNames]);

  const entityColorMap = useMemo(() => {
    const entities = (entitiesData?.entities ?? []) as { id: number; name: string }[];
    const orderFromApi = entities.map((e) => (e.name ?? '').trim());
    const inPhotos = new Set(photosWithLocation.map((p) => (p.entity ?? '').trim()).filter(Boolean));
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const name of orderFromApi) {
      if (name && !seen.has(name)) {
        ordered.push(name);
        seen.add(name);
      }
    }
    for (const name of inPhotos) {
      if (name && !seen.has(name)) {
        ordered.push(name);
        seen.add(name);
      }
    }
    const map = new Map<string, string>();
    ordered.forEach((name, i) => {
      map.set(name, ENTITY_PALETTE[i % ENTITY_PALETTE.length]);
    });
    return map;
  }, [entitiesData, photosWithLocation]);

  const legendEntities = useMemo(() => {
    const seen = new Set<string>();
    const hasUnknown = photosWithLocation.some((p) => !(p.entity ?? '').trim());
    const list = photosWithLocation
      .map((p) => (p.entity ?? '').trim() || '')
      .filter((name, _, arr) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .sort((a, b) => (a || 'Unknown').localeCompare(b || 'Unknown'));
    if (hasUnknown && !seen.has('')) {
      list.push('');
    }
    return list;
  }, [photosWithLocation]);

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
      const iconCache = new Map<string, L.DivIcon>();
      function getIconForColor(color: string): L.DivIcon {
        let icon = iconCache.get(color);
        if (!icon) {
          const escaped = color.replace(/"/g, '&quot;');
          icon = Leaflet.divIcon({
            className: 'ce-df-photos-location-marker',
            html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));" title="Photo location">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${escaped}" style="fill:${escaped}"/>
                <circle cx="12" cy="9" r="2.5" fill="white"/>
              </svg>
            </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28],
          });
          iconCache.set(color, icon);
        }
        return icon;
      }

      photosWithLocation.forEach((photo: { latitude?: number; longitude?: number; id: number; filename?: string; checkpoint_name?: string; entity?: string; execution_stage?: string; status?: string }) => {
        if (photo.latitude == null || photo.longitude == null) return;
        const entityKey = (photo.entity ?? '').trim();
        const color = entityColorMap.get(entityKey) ?? ENTITY_FALLBACK_COLOR;
        const icon = getIconForColor(color);
        const imageUrl = `/api/photos/${photo.id}/image`;
        const viewFullUrl = `/view-photo/${photo.id}`;
        Leaflet.marker([photo.latitude, photo.longitude], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width: 200px;">
              <a href="${viewFullUrl}"><img src="${imageUrl}" alt="" style="width: 200px; height: 200px; object-fit: cover;" /></a>
              <a href="${viewFullUrl}">View full size</a>
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
  }, [selectedRouteId, photosWithLocation, latLngs, entityColorMap]);

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
        {/* Route and Subsection side by side */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Route</label>
            <SearchableSelect
              options={routeOptions}
              value={selectedRouteId}
              onChange={(v) => {
                const next = v === '' ? '' : String(v);
                setSelectedRouteId(next);
                if (next === '') setSelectedSubsectionId('');
              }}
              placeholder="Select route"
              className="min-w-0 w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Subsection</label>
            <SearchableSelect
              options={subsectionOptions}
              value={selectedSubsectionId}
              onChange={(v) => setSelectedSubsectionId(v === '' ? '' : String(v))}
              placeholder="All subsections"
              className="min-w-0 w-full"
              disabled={!selectedRouteId}
            />
          </div>
        </div>

        {/* Entity: radio All vs Select multiple */}
        {selectedRouteId && (
          <div className="mb-4 bg-white border border-slate-200 rounded-lg p-4">
            <span className="text-xs font-medium text-slate-600 block mb-2">Entity</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="entity-mode"
                  checked={entityFilterMode === 'all'}
                  onChange={() => setEntityFilterMode('all')}
                  className="rounded-full border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">All entities</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="entity-mode"
                  checked={entityFilterMode === 'multiple'}
                  onChange={() => setEntityFilterMode('multiple')}
                  className="rounded-full border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Select multiple</span>
              </label>
            </div>
            {entityFilterMode === 'multiple' && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2">
                {entityList.map((name) => {
                  const color = entityColorMap.get(name) ?? ENTITY_FALLBACK_COLOR;
                  const checked = selectedEntityNames.has(name);
                  return (
                    <label key={name} className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedEntityNames((prev) => {
                            const next = new Set(prev);
                            if (next.has(name)) next.delete(name);
                            else next.add(name);
                            return next;
                          });
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="w-3 h-3 rounded-full shrink-0 border border-slate-300" style={{ backgroundColor: color }} aria-hidden />
                      <span className="text-sm text-slate-700">{name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-slate-500 text-xs mt-2">{isLoading ? 'Loading…' : `${photosWithLocation.length} photo(s)`}</p>
          </div>
        )}
        {!selectedRouteId && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm mb-4">
            Select a route to see photos on the map.
          </div>
        )}
        {selectedRouteId && photosWithLocation.length > 0 && legendEntities.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-600">Entity</span>
            {legendEntities.map((name) => {
              const color = entityColorMap.get(name) ?? ENTITY_FALLBACK_COLOR;
              return (
                <span key={name} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-slate-300"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="text-slate-700">{name || 'Unknown'}</span>
                </span>
              );
            })}
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div ref={mapRef} className="w-full h-[calc(100vh-220px)] min-h-[300px]" />
        </div>
      </main>
    </div>
  );
}
