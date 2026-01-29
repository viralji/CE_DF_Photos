'use client';

import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

export type GeoCoords = { latitude: number; longitude: number; accuracy?: number } | null;

type Props = {
  onCapture: (file: File, geo: GeoCoords) => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function CameraCapture({ onCapture, onCancel, disabled }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'choice' | 'live'>('choice');
  const [capturing, setCapturing] = useState(false);

  const getGeo = useCallback((): Promise<GeoCoords> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  useLayoutEffect(() => {
    if (mode !== 'live' || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = streamRef.current;
    video.play().catch((err) => {
      setError('Could not start camera. Allow camera access and try again.');
    });
  }, [mode]);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) {
        setError('Please select an image file.');
        return;
      }
      setError('');
      const geo = await getGeo();
      onCapture(file, geo);
    },
    [getGeo, onCapture]
  );

  const startLiveCamera = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera not supported. Use "Choose from gallery" or try another browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('live');
    } catch (err) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        setMode('live');
      } catch (e) {
        setError('Could not access camera. Use "Choose from gallery" or allow camera permission.');
      }
    }
  }, []);

  const captureFromLive = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setError('Could not capture image.');
        setCapturing(false);
        return;
      }
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) {
        setError('Could not create image.');
        setCapturing(false);
        return;
      }
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopStream();
      setMode('choice');
      const geo = await getGeo();
      onCapture(file, geo);
    } catch (e) {
      setError('Capture failed.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, getGeo, onCapture, stopStream]);

  const handleCameraClick = useCallback(() => {
    setError('');
    startLiveCamera();
  }, [startLiveCamera]);

  const handleGalleryClick = useCallback(() => {
    setError('');
    galleryInputRef.current?.click();
  }, []);

  const backToChoice = useCallback(() => {
    stopStream();
    setMode('choice');
    setError('');
  }, [stopStream]);

  if (mode === 'live') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-black">
        <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain bg-black rounded-lg"
            style={{ maxHeight: '70vh' }}
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
        <div className="flex-shrink-0 p-4 bg-black/80 flex flex-col gap-2">
          <button
            type="button"
            onClick={captureFromLive}
            disabled={capturing}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {capturing ? 'Capturing…' : 'Capture photo'}
          </button>
          <button
            type="button"
            onClick={backToChoice}
            className="w-full py-2 border border-slate-400 text-white rounded-lg hover:bg-white/10"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Add photo</h3>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleCameraClick}
            disabled={disabled}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Take photo (camera)
          </button>
          <button
            type="button"
            onClick={handleGalleryClick}
            disabled={disabled}
            className="w-full px-4 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
          >
            Choose from gallery
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
