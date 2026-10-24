import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  ClipboardList,
  FileText,
  LayoutGrid,
  Megaphone,
  Send,
  ShieldCheck,
  Sun,
  Moon,
  Users,
} from "lucide-react";
import { useFieldQueue } from "@/components/FieldQueue";
import { endSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { User } from "@/lib/types";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/mines", label: "Mine intelligence", icon: BookOpen },
  { to: "/inspections", label: "Field inspections", icon: ClipboardList },
  { to: "/compliance", label: "Compliance register", icon: ShieldCheck, badge: "12" },
  { to: "/contractors", label: "Contractors", icon: Users },
  { to: "/environment", label: "Environment", icon: Activity },
  { to: "/corrective-actions", label: "Corrective actions", icon: ClipboardList },
  { to: "/grievances", label: "Grievances", icon: Megaphone },
  { to: "/assistant", label: "AI assistant", icon: Bot },
  { to: "/reports", label: "Reports & audit", icon: FileText },
] as const;

interface SidebarProps {
  user: User;
  role: string;
}

export default function Sidebar({ user, role }: SidebarProps) {
  const { queueCount } = useFieldQueue();
  const { theme, resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary font-mono text-xs font-bold text-primary-foreground">
          CS
        </div>
        <div className="text-[13px] font-semibold tracking-[0.16em] text-foreground">
          COALSMART <span className="font-mono font-medium text-primary">/ GOV</span>
        </div>
      </div>

      <div className="mx-5 mt-6 flex items-center justify-between border-b border-border pb-4">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.13em] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
          Live control room
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          50
        </span>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            data-testid={`nav-link-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          >
            {({ isActive }) => (
              <span
                className={`relative flex items-center gap-3 rounded px-3 py-2 text-[13px] transition-colors ${
                  isActive
                    ? "bg-accent font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded bg-primary" />
                )}
                <item.icon className="h-4 w-4" />
                {item.label}
                {"badge" in item && item.badge ? (
                  <span
                    data-testid="nav-compliance-badge"
                    className="ml-auto rounded bg-destructive px-1.5 py-0.5 font-mono text-[10px] text-white"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-4 mb-3 rounded-lg border border-border bg-secondary px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Send className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">Field sync</p>
              <p className="font-mono text-[11px] text-muted-foreground" data-testid="field-sync-count">
                {queueCount} records queued
              </p>
            </div>
          </div>
          <span
            data-testid="field-sync-status-dot"
            className="h-2 w-2 rounded-full bg-chart-3 motion-safe:animate-pulse"
          />
        </div>
      </div>

      <div className="mx-4 mb-4 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-mono text-[11px] text-muted-foreground">
            {initials}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground" data-testid="sidebar-user-name">
              {user.name}
            </p>
            <p className="text-[11px] text-muted-foreground" data-testid="sidebar-user-role">
              {role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="signout-button"
            aria-label="Sign out"
            onClick={() =>
              void (async () => {
                await endSession();
                navigate("/login");
              })()
            }
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            data-testid="sidebar-theme-toggle"
            aria-label={`Switch theme (currently ${resolved})`}
            title={`Theme: ${resolved}`}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            onClick={() => toggle()}
          >
            {theme === "system" ? (
              <span className="text-[10px] font-mono">system</span>
            ) : resolved === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
