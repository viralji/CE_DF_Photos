'use client';

type Props = {
  imageUrl: string;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** e.g. S3 URL to open raw object in a new tab */
  openInNewTabHref?: string | null;
};

export function PatrolPhotoLightbox({ imageUrl, onClose, title, subtitle, openInNewTabHref }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/90 z-[600] flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="max-h-[85vh] max-w-full rounded-lg shadow-lg" />
        <div className="absolute top-4 right-4 flex flex-wrap justify-end gap-2">
          {openInNewTabHref ? (
            <a
              href={openInNewTabHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 text-sm font-medium rounded"
            >
              Open full size
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-white/90 hover:bg-white text-slate-800 text-sm font-medium rounded"
          >
            Close
          </button>
        </div>
        {(title || subtitle) && (
          <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/70 px-3 py-2 text-white text-sm">
            {title ? <p className="font-medium truncate">{title}</p> : null}
            {subtitle ? <p className="text-xs text-slate-200 truncate">{subtitle}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
