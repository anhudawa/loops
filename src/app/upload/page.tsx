"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import Link from "next/link";

const COUNTRIES = ["Ireland", "UK", "USA", "Spain"];

const DISCIPLINE_OPTIONS = [
  { value: "gravel", label: "Gravel", icon: "🪨" },
  { value: "road", label: "Road", icon: "🚲" },
  { value: "mtb", label: "MTB", icon: "🏔️" },
];

export default function UploadPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    difficulty: "moderate",
    surface_type: "gravel",
    country: "Ireland",
    region: "",
    discipline: "gravel",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Fetch regions when country changes
  useEffect(() => {
    fetch(`/api/routes?regions=true&country=${encodeURIComponent(form.country)}`)
      .then((r) => r.json())
      .then((data) => {
        setRegions(Array.isArray(data) ? data : []);
      });
  }, [form.country]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a GPX file");
      return;
    }
    if (!form.name || !form.region) {
      setError("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.append("gpx", file);
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("difficulty", form.difficulty);
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
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>Upload a GPX file from your ride and share it with the community.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* GPX Upload */}
          <div
            className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all"
            style={{
              borderColor: dragging ? "var(--accent)" : file ? "var(--accent)" : "var(--border)",
              background: dragging ? "var(--accent-glow-strong)" : file ? "var(--accent-glow)" : "transparent",
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f && f.name.endsWith(".gpx")) {
                setFile(f);
                if (!form.name) setForm((prev) => ({ ...prev, name: f.name.replace(".gpx", "") }));
              } else {
                setError("Please drop a .gpx file");
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  if (!form.name) {
                    setForm((prev) => ({ ...prev, name: f.name.replace(".gpx", "") }));
                  }
                }
              }}
            />
            {file ? (
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
                <p className="font-bold" style={{ color: "var(--text-secondary)" }}>Click to upload GPX file</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Supports .gpx files from Strava, Garmin, Komoot, etc.</p>
              </div>
            )}
          </div>

          {/* Route Name */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
              Route Name <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ballyhoura Mountain Loop"
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
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
                Difficulty <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={form.difficulty}
                onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
                className="w-full rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                style={inputStyle}
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>

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
            disabled={submitting}
            className="btn-accent w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Uploading..." : "Upload Route"}
          </button>
        </form>
      </div>
    </div>
  );
}
