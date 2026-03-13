"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import Link from "next/link";

interface Photo {
  id: string;
  user_name: string | null;
  filename: string;
  caption: string | null;
  created_at: string;
}

export default function PhotoGallery({ routeId }: { routeId: string }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/routes/${routeId}/photos`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setPhotos)
      .catch(() => setError(true));
  }, [routeId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("photo", file);

    const res = await fetch(`/api/routes/${routeId}/photos`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      setPhotos(data);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-extrabold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Photos
          {photos.length > 0 && (
            <span className="font-normal ml-2" style={{ color: "var(--text-muted)" }}>({photos.length})</span>
          )}
        </h2>
        {user && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-sm font-bold hover:opacity-80 disabled:opacity-50 flex items-center gap-1"
              style={{ color: "var(--accent)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {uploading ? "Uploading..." : "Add Photo"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Could not load photos</p>
      )}

      {!error && !user && photos.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
          <Link href="/login" className="font-bold hover:opacity-80" style={{ color: "var(--accent)" }}>Sign in</Link> to add photos
        </p>
      )}

      {!error && photos.length === 0 && user && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>No photos yet. Be the first to share one!</p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-[4/3] rounded-lg overflow-hidden cursor-pointer group"
              style={{ border: "1px solid var(--border)" }}
              onClick={() => setExpanded(expanded === photo.id ? null : photo.id)}
            >
              <img
                src={`/photos/${photo.filename}`}
                alt={photo.caption || "Route photo"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-xs text-white truncate">{photo.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setExpanded(null)}
        >
          <div className="max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const photo = photos.find((p) => p.id === expanded);
              if (!photo) return null;
              return (
                <>
                  <img
                    src={`/photos/${photo.filename}`}
                    alt={photo.caption || "Route photo"}
                    className="max-w-full max-h-[85vh] rounded-lg object-contain"
                  />
                  {photo.caption && (
                    <p className="text-white text-center mt-2 text-sm">{photo.caption}</p>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
