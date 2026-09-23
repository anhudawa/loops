"use client";

import { ENABLED_DISCIPLINES } from "@/config/constants";

import { useState, useRef, useEffect, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import StravaConnectButton from "@/components/StravaConnectButton";
import StravaActivityBrowser from "@/components/StravaActivityBrowser";
import { DEFAULT_COUNTRY } from "@/config/constants";

const COUNTRIES = ["Ireland", "UK", "USA", "Spain"];

const DISCIPLINE_OPTIONS = [
  { value: "road", label: "Road", icon: "🚲" },
  { value: "gravel", label: "Gravel", icon: "🪨" },
  { value: "mtb", label: "MTB", icon: "🏔️" },
].filter((d) => (ENABLED_DISCIPLINES as readonly string[]).includes(d.value));

const SUPPORTED_EXTENSIONS = [".gpx", ".fit", ".tcx"];

// Bulk import: how many files one batch may hold. Each file still goes through
// the exact same POST /api/routes parse+save path as a single upload — we just
// iterate it. Kept modest so a batch stays inside the upload rate limit.
const MAX_BULK_FILES = 30;

type BulkStatus = "pending" | "success" | "error";

interface BulkResult {
  status: BulkStatus;
  routeId?: string;
  error?: string;
}

function detectUrlProvider(url: string): { name: string; supported: boolean } | null {
  if (/ridewithgps\.com\/(routes|trips)\/\d+/.test(url)) return { name: "RideWithGPS", supported: true };
  if (/strava\.com\/(activities|routes)\/\d+/.test(url)) return { name: "Strava", supported: false };
  return null;
}

interface ParsedRoute {
  coordinates: number[][];
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  start_lat: number;
  start_lng: number;
  strava_activity_id: number;
}

export default function UploadPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [urlProvider, setUrlProvider] = useState<{ name: string; supported: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    surface_type: "road",
    country: DEFAULT_COUNTRY,
    region: "",
    discipline: "road",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [stravaConnected, setStravaConnected] = useState(false);
  const [importingActivity, setImportingActivity] = useState<number | null>(null);
  const [showStravaImport, setShowStravaImport] = useState(false);
  const [parsedRoute, setParsedRoute] = useState<ParsedRoute | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/upload");
    }
  }, [user, loading, router]);

  // Initialize stravaConnected from auth context
  useEffect(() => {
    if (user) {
      setStravaConnected(!!user.strava_id);
    }
  }, [user]);

  // Handle post-OAuth redirect URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("strava_connected") === "true") {
      setStravaConnected(true);
      setShowStravaImport(true);
      window.history.replaceState({}, "", "/upload");
    }
    if (params.get("strava_error")) {
      window.history.replaceState({}, "", "/upload");
    }
  }, []);

  // Fetch regions when country changes
  useEffect(() => {
    fetch(`/api/routes?regions=true&country=${encodeURIComponent(form.country)}`)
      .then((r) => r.json())
      .then((data) => {
        setRegions(Array.isArray(data) ? data : []);
      });
  }, [form.country]);

  // Detect URL provider as user types
  useEffect(() => {
    setUrlProvider(importUrl ? detectUrlProvider(importUrl) : null);
  }, [importUrl]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full" style={{ background: "var(--border)" }} />
          <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
        </div>
      </div>
    );
  }

  const isValidFile = (f: File) => {
    return SUPPORTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext));
  };

  const stripExtension = (filename: string) => {
    return filename.replace(/\.(gpx|fit|tcx)$/i, "");
  };

  // Route file selection for both the picker and drag-drop. One valid file →
  // the existing single-file flow (unchanged). Two or more → a bulk batch.
  const acceptFiles = (selected: FileList | File[]) => {
    const all = Array.from(selected);
    if (all.length === 0) return;
    const valid = all.filter(isValidFile);
    const skipped = all.length - valid.length;

    if (valid.length === 0) {
      setError("Unsupported file. Please use .gpx, .fit, or .tcx files.");
      return;
    }

    setBulkResults([]);

    if (valid.length === 1) {
      // Single-file path — identical behaviour to before.
      setBulkFiles([]);
      const f = valid[0];
      setFile(f);
      if (!form.name) setForm((prev) => ({ ...prev, name: stripExtension(f.name) }));
      setError(skipped > 0 ? "Skipped a file that wasn't .gpx, .fit or .tcx." : "");
      return;
    }

    // Bulk path.
    setFile(null);
    const capped = valid.slice(0, MAX_BULK_FILES);
    setBulkFiles(capped);
    if (valid.length > MAX_BULK_FILES) {
      setError(`Up to ${MAX_BULK_FILES} files per batch — importing the first ${MAX_BULK_FILES}.`);
    } else if (skipped > 0) {
      setError(`${skipped} file${skipped === 1 ? "" : "s"} skipped — only .gpx, .fit and .tcx are supported.`);
    } else {
      setError("");
    }
  };

  const clearBulk = () => {
    setBulkFiles([]);
    setBulkResults([]);
    setError("");
  };

  // Bulk import — iterate the batch through the SAME POST /api/routes endpoint
  // the single-file flow uses. Sequential so we stay within the upload rate
  // limit and can show per-file progress. Route name comes from each filename;
  // discipline/surface/country/region are the shared form values.
  const handleBulkSubmit = async () => {
    if (bulkFiles.length === 0) return;
    if (!form.region) {
      setError("Add a Region — it's applied to every file in the batch.");
      return;
    }
    setError("");
    setBulkSubmitting(true);
    setBulkResults(bulkFiles.map(() => ({ status: "pending" as BulkStatus })));

    let ok = 0;
    for (let i = 0; i < bulkFiles.length; i++) {
      const f = bulkFiles[i];
      const formData = new FormData();
      formData.append("route_file", f);
      formData.append("name", stripExtension(f.name) || f.name);
      formData.append("description", form.description);
      formData.append("surface_type", form.surface_type);
      formData.append("county", form.region);
      formData.append("country", form.country);
      formData.append("region", form.region);
      formData.append("discipline", form.discipline);

      try {
        const res = await fetch("/api/routes", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setBulkResults((prev) =>
            prev.map((r, idx) => (idx === i ? { status: "error", error: data.error || "Upload failed" } : r))
          );
        } else {
          ok += 1;
          setBulkResults((prev) =>
            prev.map((r, idx) => (idx === i ? { status: "success", routeId: data.id } : r))
          );
        }
      } catch {
        setBulkResults((prev) =>
          prev.map((r, idx) => (idx === i ? { status: "error", error: "Network error" } : r))
        );
      }
    }

    setBulkSubmitting(false);
    const failed = bulkFiles.length - ok;
    if (ok > 0 && failed === 0) {
      toast(`Imported ${ok} route${ok === 1 ? "" : "s"}.`, "success");
    } else if (ok > 0) {
      toast(`Imported ${ok} of ${bulkFiles.length} — ${failed} failed.`, "success");
    } else {
      toast("No routes imported. See the list for details.", "error");
    }
  };

  async function handleStravaImport(activityId: number) {
    setImportingActivity(activityId);
    try {
      const res = await fetch(`/api/strava/activities/${activityId}`);
      const json = await res.json();
      if (!res.ok) {
        toast(json.error || "Import failed. Try again.", "error");
        return;
      }
      const d = json.data;
      setForm((prev) => ({
        ...prev,
        name: d.name,
        discipline: d.discipline,
        surface_type: d.discipline === "mtb" ? "trail" : d.discipline === "gravel" ? "gravel" : "road",
        country: DEFAULT_COUNTRY,
        region: "",
      }));
      setParsedRoute({
        coordinates: d.coordinates,
        distance_km: d.distance_km,
        elevation_gain_m: d.elevation_gain_m,
        elevation_loss_m: d.elevation_loss_m,
        start_lat: d.start_lat,
        start_lng: d.start_lng,
        strava_activity_id: d.strava_activity_id,
      });
      setShowStravaImport(false);
    } catch {
      toast("Import failed. Try again.", "error");
    } finally {
      setImportingActivity(null);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If a Strava activity was imported, we only need form metadata (no file/url required)
    if (!parsedRoute) {
      if (mode === "file" && !file) {
        setError("Please select a route file");
        return;
      }
      if (mode === "url" && !importUrl) {
        setError("Please paste a URL");
        return;
      }
      if (mode === "url" && !urlProvider) {
        setError("Unsupported URL. Paste a RideWithGPS route link.");
        return;
      }
      if (mode === "url" && urlProvider && !urlProvider.supported) {
        setError("Strava requires login, so we can't import directly. Export the activity as GPX or FIT from Strava, then upload the file here.");
        return;
      }
    }
    if (!form.name || !form.region) {
      setError("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    if (parsedRoute) {
      // Strava import path — send strava_activity_id instead of a file
      formData.append("strava_activity_id", String(parsedRoute.strava_activity_id));
    } else if (mode === "file" && file) {
      formData.append("route_file", file);
    } else if (mode === "url") {
      formData.append("url", importUrl);
    }
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("surface_type", form.surface_type);
    formData.append("county", form.region);
    formData.append("country", form.country);
    formData.append("region", form.region);
    formData.append("discipline", form.discipline);

    try {
      const res = await fetch("/api/routes", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload route");
      }
      const route = await res.json();
      toast("Route uploaded successfully!", "success");
      router.push(`/routes/${route.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  };

  const inputStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/" className="hover:opacity-80 transition-opacity" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <Link href="/">
            <span className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</span>
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight uppercase mb-2" style={{ color: "var(--text)" }}>Share a Loop</h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Upload a route file, drop up to {MAX_BULK_FILES} at once to bulk-import, or import from RideWithGPS.</p>

        {/* Strava Import Section */}
        <div className="mb-6 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">Import from Strava</h3>
            <StravaConnectButton
              isConnected={stravaConnected}
              returnTo="/upload"
              onDisconnected={() => {
                setStravaConnected(false);
                setShowStravaImport(false);
              }}
            />
          </div>

          {stravaConnected ? (
            showStravaImport ? (
              <StravaActivityBrowser
                onImport={handleStravaImport}
                importing={importingActivity}
              />
            ) : (
              <button
                onClick={() => setShowStravaImport(true)}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ color: "var(--accent)", border: "1px dashed var(--border)" }}
              >
                Browse Strava activities
              </button>
            )
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Import your rides directly from Strava — no file download needed.
            </p>
          )}
        </div>

        {/* Show imported Strava activity indicator */}
        {parsedRoute && (
          <div className="mb-6 px-4 py-3 rounded-xl flex items-center justify-between" style={{ background: "var(--accent-glow)", border: "1px solid var(--accent)" }}>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>Strava activity imported</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {parsedRoute.distance_km} km · {parsedRoute.elevation_gain_m}m gain · Fill in the details below to publish
              </p>
            </div>
            <button
              type="button"
              onClick={() => setParsedRoute(null)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Mode Toggle — only show when no Strava activity is imported */}
        {!parsedRoute && (
          <div className="flex rounded-xl overflow-hidden mb-6" style={{ border: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setMode("file")}
              className="flex-1 py-2.5 text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                background: mode === "file" ? "var(--accent)" : "var(--bg-card)",
                color: mode === "file" ? "var(--bg)" : "var(--text-muted)",
              }}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => { setMode("url"); clearBulk(); }}
              className="flex-1 py-2.5 text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                background: mode === "url" ? "var(--accent)" : "var(--bg-card)",
                color: mode === "url" ? "var(--bg)" : "var(--text-muted)",
              }}
            >
              Import URL
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (bulkFiles.length > 0) {
              handleBulkSubmit();
            } else {
              handleSubmit(e);
            }
          }}
          className="space-y-6"
        >
          {!parsedRoute && (mode === "file" ? (
            /* File Upload Drop Zone */
            <div
              className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all"
              style={{
                borderColor: dragging || file || bulkFiles.length > 0 ? "var(--accent)" : "var(--border)",
                background: dragging ? "var(--accent-glow-strong)" : file || bulkFiles.length > 0 ? "var(--accent-glow)" : "transparent",
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragging(false);
                acceptFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".gpx,.fit,.tcx"
                multiple
                className="hidden"
                onChange={(e) => acceptFiles(e.target.files ?? [])}
              />
              {bulkFiles.length > 0 ? (
                <div>
                  <svg className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold" style={{ color: "var(--text)" }}>{bulkFiles.length} files ready to import</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Each route is named from its filename. Set the shared details below, then import.</p>
                </div>
              ) : file ? (
                <div>
                  <svg className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-bold" style={{ color: "var(--text)" }}>{file.name}</p>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div>
                  <svg className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="font-bold" style={{ color: "var(--text-secondary)" }}>Click to upload — or drop a whole folder</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>One file, or up to {MAX_BULK_FILES} at once. Supports .gpx, .fit, and .tcx from Strava, Garmin, Wahoo, Komoot</p>
                </div>
              )}
            </div>
          ) : (
            /* URL Import */
            <div>
              <div className="relative">
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://ridewithgps.com/routes/..."
                  className="w-full rounded-xl px-4 py-3.5 text-sm pr-32"
                  style={inputStyle}
                />
                {urlProvider && (
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-2.5 py-1 rounded-lg"
                    style={{
                      background: urlProvider.supported ? "var(--accent-glow)" : "rgba(255,51,85,0.15)",
                      color: urlProvider.supported ? "var(--accent)" : "var(--danger)",
                    }}
                  >
                    {urlProvider.name}
                  </span>
                )}
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Paste a RideWithGPS route URL to import directly
              </p>
              {urlProvider && !urlProvider.supported && (
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--danger)" }}>
                  Strava requires login — export your activity as GPX or FIT from Strava, then switch to &quot;Upload File&quot; above.
                </p>
              )}
            </div>
          ))}

          {/* Bulk batch list — shown when 2+ files are selected. Names come
              from filenames; the shared fields below apply to every file. */}
          {bulkFiles.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Batch import · {bulkFiles.length} files (max {MAX_BULK_FILES})
                </p>
                {!bulkSubmitting && (
                  <button type="button" onClick={clearBulk} className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Clear
                  </button>
                )}
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {bulkFiles.map((f, i) => {
                  const r = bulkResults[i];
                  return (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{stripExtension(f.name)}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {f.name} · {(f.size / 1024).toFixed(1)} KB
                          {r?.status === "error" && r.error ? ` · ${r.error}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-xs font-bold">
                        {!r && <span style={{ color: "var(--text-muted)" }}>Queued</span>}
                        {r?.status === "pending" && (
                          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            Importing
                          </span>
                        )}
                        {r?.status === "success" && r.routeId && (
                          <Link href={`/routes/${r.routeId}`} className="hover:opacity-80" style={{ color: "var(--accent)" }}>
                            View route →
                          </Link>
                        )}
                        {r?.status === "error" && <span style={{ color: "var(--danger)" }}>Failed</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Route Name — single-file only. In a bulk batch each route is named
              from its filename, so this field is hidden. */}
          {bulkFiles.length === 0 && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Route Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ballyhoura Mountain Loop"
              maxLength={200}
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              maxLength={5000}
              placeholder="Tell others about this route - surface conditions, highlights, tips..."
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Discipline pills */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Discipline <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div className="flex gap-2">
              {DISCIPLINE_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, discipline: d.value }))}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: form.discipline === d.value ? "var(--accent-glow)" : "var(--bg-card)",
                    border: form.discipline === d.value ? "1px solid var(--accent)" : "1px solid var(--border)",
                    color: form.discipline === d.value ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <span>{d.icon}</span>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Country + Region row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Country <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value, region: "" }))}
                className="w-full rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                style={inputStyle}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Region <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                placeholder={form.country === "Ireland" ? "e.g. Cork" : form.country === "UK" ? "e.g. Yorkshire" : form.country === "USA" ? "e.g. Colorado" : "e.g. Girona"}
                list="region-suggestions"
                className="w-full rounded-lg px-4 py-2.5 text-sm"
                style={inputStyle}
              />
              <datalist id="region-suggestions">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Surface <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={form.surface_type}
                onChange={(e) => setForm((prev) => ({ ...prev, surface_type: e.target.value }))}
                className="w-full rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                style={inputStyle}
              >
                <option value="gravel">Gravel</option>
                <option value="mixed">Mixed</option>
                <option value="trail">Trail</option>
                <option value="road">Road</option>
                <option value="singletrack">Singletrack</option>
                <option value="technical">Technical</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="alert-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || bulkSubmitting}
            className="btn-accent w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
          >
            {(submitting || bulkSubmitting) && (
              <span
                className="absolute inset-0 animate-pulse"
                style={{ background: "rgba(255,255,255,0.1)" }}
              />
            )}
            {submitting || bulkSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {bulkSubmitting ? "Importing routes..." : parsedRoute ? "Saving route..." : mode === "url" ? "Importing route..." : "Parsing & uploading..."}
              </span>
            ) : bulkFiles.length > 0 ? (
              `Import ${bulkFiles.length} routes`
            ) : (
              parsedRoute ? "Save Strava Route" : mode === "url" ? "Import Route" : "Upload Route"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
