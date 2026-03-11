import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { MapPin, Clock, Briefcase } from "lucide-react";

interface Job {
  name: string;
  job_title: string;
  status: string;
  location: string;
  closes_on: string;
  custom_application_level: string;
  description: string;
}

const LEVEL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Intern: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-100",
  },
  Standard: {
    bg: "bg-stone-100",
    text: "text-stone-700",
    border: "border-stone-200",
  },
  Senior: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-100",
  },
};

function LevelBadge({ level }: { level: string }) {
  const colors = LEVEL_COLORS[level] ?? LEVEL_COLORS.Standard;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {level || "Standard"}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white border border-stone-100 shadow-sm p-6 animate-pulse">
      <div className="h-4 bg-stone-200 rounded w-1/3 mb-3" />
      <div className="h-6 bg-stone-200 rounded w-2/3 mb-4" />
      <div className="h-4 bg-stone-100 rounded w-full mb-2" />
      <div className="h-4 bg-stone-100 rounded w-3/4 mb-6" />
      <div className="flex items-center justify-between">
        <div className="h-4 bg-stone-100 rounded w-1/4" />
        <div className="h-9 bg-stone-200 rounded w-24" />
      </div>
    </div>
  );
}

function formatClosesOn(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function JobCard({ job, onApply }: { job: Job; onApply: (job: Job) => void }) {
  const snippet = job.description
    ? job.description.replace(/<[^>]+>/g, "").slice(0, 150) +
      (job.description.length > 150 ? "…" : "")
    : "";

  return (
    <div className="group rounded-2xl bg-white border border-stone-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6 flex flex-col gap-4">
      {/* Level + title */}
      <div>
        <LevelBadge level={job.custom_application_level} />
        <h2 className="mt-2 text-xl font-serif font-semibold text-stone-800 leading-snug group-hover:text-amber-800 transition-colors">
          {job.job_title}
        </h2>
      </div>

      {/* Description snippet */}
      {snippet && (
        <p className="text-sm text-stone-500 leading-relaxed">{snippet}</p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-stone-400">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {job.location}
          </span>
        )}
        {job.closes_on && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Closes {formatClosesOn(job.closes_on)}
          </span>
        )}
      </div>

      {/* Apply button */}
      <div className="pt-1">
        <button
          onClick={() => onApply(job)}
          className="inline-flex items-center gap-2 rounded-full bg-amber-800 hover:bg-amber-900 text-white text-sm font-medium px-5 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2"
        >
          Apply Now
        </button>
      </div>
    </div>
  );
}

export default function JobListPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Careers | Meraki Wedding Planner";
    fetch("/inquiry-api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.data ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  function handleApply(job: Job) {
    navigate("/apply?job=" + encodeURIComponent(job.name));
  }

  return (
    <div
      style={{ backgroundColor: "#FAF8F5", minHeight: "100vh" }}
      className="font-sans"
    >
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-stone-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a
            href="https://merakiweddingplanner.com"
            className="font-serif text-lg font-bold text-stone-800 tracking-wide hover:text-amber-800 transition-colors"
          >
            Meraki
          </a>
          <nav className="text-sm text-stone-500">
            <a
              href="https://merakiweddingplanner.com"
              className="hover:text-stone-800 transition-colors"
            >
              Back to website
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-3 py-1 text-xs font-medium text-amber-700 mb-6">
          <Briefcase className="h-3.5 w-3.5" />
          We're hiring
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl font-bold text-stone-800 leading-tight mb-4">
          Join Our Team
        </h1>
        <p className="text-stone-500 text-lg max-w-2xl mx-auto leading-relaxed">
          At Meraki, we craft unforgettable wedding experiences across Southeast
          Asia. If you're passionate about love, detail, and beautiful moments —
          we'd love to meet you.
        </p>
      </section>

      {/* Jobs grid */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 mb-6">
              <Briefcase className="h-7 w-7 text-stone-400" />
            </div>
            <h2 className="font-serif text-2xl font-semibold text-stone-700 mb-2">
              No open positions at the moment
            </h2>
            <p className="text-stone-400 text-sm">
              Check back soon — new opportunities are always on the horizon.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <JobCard key={job.name} job={job} onApply={handleApply} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-100 bg-white/60 py-6 text-center text-xs text-stone-400">
        &copy; {new Date().getFullYear()} Meraki Wedding Planner. All rights reserved.
      </footer>
    </div>
  );
}
