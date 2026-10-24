import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FieldQueueProvider } from "@/components/FieldQueue";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { ThemeProvider } from "@/lib/theme";
import { useMe } from "@/lib/session";

const CRUMB: Record<string, string> = {
  "/": "Overview",
  "/mines": "Mine intelligence",
  "/inspections": "Field inspections",
  "/compliance": "Compliance register",
  "/contractors": "Contractors",
  "/environment": "Environment",
  "/corrective-actions": "Corrective actions",
  "/grievances": "Grievances",
  "/assistant": "AI assistant",
  "/reports": "Reports & audit",
  "/reports/builder": "Report builder",
};

// The signed-in command center: session guard + shell (sidebar, topbar, outlet).
// While the session check runs the shell holds; without a valid session we fall back
// to the login screen — which also keeps the static CDN preview graceful.
export default function AppShell() {
  const { data, isPending, isError } = useMe();
  const [role, setRole] = useState<string | null>(null);
  const location = useLocation();

  if (isPending) {
    return (
      <ThemeProvider>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Loading control room…
          </p>
        </div>
      </ThemeProvider>
    );
  }
  if (isError || !data) return <Navigate to="/login" replace />;

  const activeRole = role ?? data.user.role;
  const current = CRUMB[location.pathname] ?? "Overview";

  return (
    <ThemeProvider>
      <FieldQueueProvider>
        <div className="min-h-screen bg-background">
          <Sidebar user={data.user} role={activeRole} />
          <div className="lg:pl-60">
            <Topbar user={data.user} role={activeRole} onRoleChange={setRole} current={current} />
            <main className="mx-auto w-full max-w-[1160px] space-y-6 p-6 lg:p-8 bg-background">
              <Outlet />
            </main>
          </div>
        </div>
      </FieldQueueProvider>
    </ThemeProvider>
  );
}
