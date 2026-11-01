import { JobSidebar } from "@/components/job-sidebar";

/** The new-job composer and every job page share the past-jobs sidebar. */
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row">
      <JobSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
