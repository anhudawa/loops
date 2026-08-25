"use client";

import { useState, useRef, useEffect, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { DEFAULT_COUNTRY } from "@/config/constants";
import { RIDE_SOURCE_PLATFORMS } from "@/config/route-policy";

const COUNTRIES = ["Ireland"];

const DISCIPLINE_OPTIONS = [
  { value: "road", label: "Road", icon: "🚲" },
];

const SUPPORTED_EXTENSIONS = [".gpx", ".fit", ".tcx"];

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
    surface_type: "road",
    country: DEFAULT_COUNTRY,
    region: "",
    discipline: "road",
  });
  const [riddenAt, setRiddenAt] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [riddenBySubmitter, setRiddenBySubmitter] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contributorAccess, setContributorAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/upload");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/beta/application")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setContributorAccess(data.contributorAccess === true))
      .catch(() => setContributorAccess(false));
  }, [user]);

  // Fetch regions when country changes
  useEffect(() => {
    fetch(`/api/routes?regions=true&country=${encodeURIComponent(form.country)}`)
      .then((r) => r.json())
      .then((data) => {
        setRegions(Array.isArray(data) ? data : []);
      });
  }, [form.country]);

  if (loading || !user || contributorAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full" style={{ background: "var(--border)" }} />
          <div className="h-3 rounded w-24" style={{ background: "var(--border)" }} />
        </div>
      </div>
    );
  }

  if (!contributorAccess) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg)" }}>
        <header className="px-4 md:px-6 py-3" style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border)" }}>
          <div className="max-w-2xl mx-auto"><Link href="/" className="logo-mark text-xl" style={{ color: "var(--text)" }}>LOOPS</Link></div>
        </header>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold mb-3" style={{ color: "var(--text)" }}>Founding contributors only</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Apply first so we can allocate coverage, confirm the contributor terms and keep independent review capacity manageable.
          </p>
          <Link href="/beta" className="btn-accent inline-flex px-6 py-3 rounded-xl text-sm font-bold">Apply as a contributor</Link>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ireland road beta: only a rider-owned recording can enter review.
    if (!file) {
      setError("Please upload the GPX, FIT, or TCX recording from a ride you completed");
      return;
    }
    if (!riddenAt || !sourcePlatform || !riddenBySubmitter || !rightsConfirmed || !privacyConfirmed) {
      setError("Select the recording source, confirm when you rode it, and accept the contributor declarations");
      return;
    }
    if (!form.name || !form.region) {
      setError("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.append("route_file", file);
    formData.append("name", form.name);
    formData.append("description", form.description);
    formData.append("surface_type", form.surface_type);
    formData.append("county", form.region);
    formData.append("country", form.country);
    formData.append("region", form.region);
    formData.append("discipline", form.discipline);
    formData.append("ridden_at", riddenAt);
    formData.append("source_platform", sourcePlatform);
    formData.append("source_reference", sourceReference.trim());
    formData.append("ridden_by_submitter", String(riddenBySubmitter));
    formData.append("rights_confirmed", String(rightsConfirmed));
    formData.append("privacy_confirmed", String(privacyConfirmed));

    try {
      const res = await fetch("/api/routes", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload route");
      }
      await res.json();
      toast("Route submitted for human review.", "success");
      router.push("/submissions");
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
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Ireland road beta: submit the recording from a loop you personally rode. Every submission is reviewed before publication.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              if (f && isValidFile(f)) {
                setFile(f);
                if (!form.name) setForm((prev) => ({ ...prev, name: stripExtension(f.name) }));
              } else {
                setError("Unsupported file. Please use .gpx, .fit, or .tcx files.");
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,.fit,.tcx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && isValidFile(f)) {
                  setFile(f);
                  setError("");
                  if (!form.name) {
                    setForm((prev) => ({ ...prev, name: stripExtension(f.name) }));
                  }
                } else if (f) {
                  setFile(null);
                  setError("Unsupported file. Please use .gpx, .fit, or .tcx files.");
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
                <p className="font-bold" style={{ color: "var(--text-secondary)" }}>Upload your completed ride file</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>GPX, FIT or TCX exported from your recording app or bike computer</p>
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
              maxLength={200}
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Recording source <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                style={inputStyle}
              >
                <option value="">Select the source</option>
                {RIDE_SOURCE_PLATFORMS.map((platform) => (
                  <option key={platform.value} value={platform.value}>{platform.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Activity or route reference <span className="normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={sourceReference}
                onChange={(e) => setSourceReference(e.target.value)}
                maxLength={500}
                placeholder="Private activity ID or your own link"
                className="w-full rounded-lg px-4 py-2.5 text-sm"
                style={inputStyle}
              />
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                Used by reviewers only; LOOPS never republishes this reference.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                Date ridden <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                type="date"
                value={riddenAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setRiddenAt(e.target.value)}
                className="w-full rounded-lg px-4 py-2.5 text-sm"
                style={inputStyle}
              />
            </div>
            <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Submission does not mean publication. LOOPS checks the exact geometry, evidence, road suitability and rights before the loop appears publicly.
            </div>
          </div>

          <div className="space-y-3 rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={riddenBySubmitter}
                onChange={(e) => setRiddenBySubmitter(e.target.checked)}
                className="mt-1"
              />
              <span>I personally rode this exact loop and the uploaded file records that ride.</span>
            </label>
            <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                I own or control this recording, have checked the recording source permits my use,
                and accept the route-contributor licence in the{" "}
                <Link href="/terms" target="_blank" className="font-bold underline" style={{ color: "var(--accent)" }}>Terms</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={privacyConfirmed}
                onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>
                I understand the approved loop, my contributor name and ride date will be public,
                and I have checked the start and finish do not reveal my home or another sensitive
                location. See the{" "}
                <Link href="/privacy" target="_blank" className="font-bold underline" style={{ color: "var(--accent)" }}>Privacy Policy</Link>.
              </span>
            </label>
          </div>

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
                disabled
                className="w-full rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                style={inputStyle}
              >
                <option value="road">Road</option>
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
            className="btn-accent w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
          >
            {submitting && (
              <span
                className="absolute inset-0 animate-pulse"
                style={{ background: "rgba(255,255,255,0.1)" }}
              />
            )}
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Checking &amp; uploading...
              </span>
            ) : (
              "Submit for review"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
