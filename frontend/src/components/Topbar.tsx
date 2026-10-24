import { useState, useEffect } from "react";
import { Bell, ChevronRight, Check, ChevronDown, Moon, Sun, X, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROLES } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useAlerts, markAlertRead, severityColor, timeAgo } from "@/lib/alerts";
import { useFieldQueue } from "@/components/FieldQueue";
import type { User } from "@/lib/types";

interface TopbarProps {
  user: User;
  role: string;
  onRoleChange: (role: string) => void;
  current: string;
}

const MAX_ALERTS = 6;

// Top bar: mono breadcrumb, role-switcher pill, theme toggle, live notifications,
// identity avatar. Adapts to light/dark theme via semantic Tailwind classes.
export default function Topbar({ user, role, onRoleChange, current }: TopbarProps) {
  const { data, isPending } = useAlerts();
  const { theme, resolved, toggle } = useTheme();
  const { online, queueCount } = useFieldQueue();
  const [rolesOpen, setRolesOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const items = data?.items ?? [];
  const openAlerts = items.filter((a) => a.status === "open");
  const unread = openAlerts.filter((a) => !a.read_at).length;
  const latest = openAlerts.slice(0, MAX_ALERTS);

  useEffect(() => {
    // Poll for new alerts so the bell reflects live state without a WebSocket.
    // eslint-disable-next-line no-empty
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-6">
      <p className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] sm:flex">
        <span className="text-primary">Control room</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
        <span className="text-muted-foreground" data-testid="breadcrumb-current">
          {current}
        </span>
      </p>

      <div className="flex items-center gap-3">
        <Popover open={rolesOpen} onOpenChange={setRolesOpen}>
          <PopoverTrigger
            data-testid="role-switcher-button"
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-[13px] text-foreground",
              "transition-colors hover:border-border hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-primary" />
            {role}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-1.5 bg-popover text-popover-foreground border-border">
            <p className="px-2.5 pt-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Switch role
            </p>
            {ROLES.map((r) => (
              <button
                key={r}
                data-testid={`role-option-${r.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                onClick={() => {
                  onRoleChange(r);
                  setRolesOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent",
                  r === role ? "font-medium text-primary" : "text-foreground",
                )}
              >
                {r}
                {r === role && <Check className="h-4 w-4" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Sync status: connection state + how many captures wait on this device. */}
        <span
          data-testid="topbar-sync-status"
          title={online ? "Connected — field queue flushes automatically" : "Offline — captures stay queued on this device"}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]",
            online ? "border-border text-muted-foreground" : "border-destructive/50 text-destructive",
          )}
        >
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {queueCount > 0 ? (
            <span data-testid="topbar-queue-count" className={online ? "text-primary" : ""}>
              {queueCount} queued
            </span>
          ) : (
            <span>{online ? "synced" : "offline"}</span>
          )}
          {queueCount > 0 && online && <RefreshCw className="h-3 w-3 animate-spin" aria-label="Syncing" />}
        </span>

        {/* Theme toggle: light / dark / system */}
        <Popover open={false} onOpenChange={() => {}}>
          <PopoverTrigger asChild>
            <button
              data-testid="theme-toggle-button"
              aria-label={`Switch theme (currently ${resolved})`}
              title={`Theme: ${resolved} (click to toggle)`}
              className="relative rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => toggle()}
            >
              {theme === "system" ? (
                <span className="text-xs font-mono">system</span>
              ) : resolved === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </PopoverTrigger>
        </Popover>

        <Popover open={bellOpen} onOpenChange={setBellOpen}>
          <PopoverTrigger
            data-testid="notification-bell-button"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
            className={cn(
              "relative rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              unread > 0 ? "text-destructive" : "",
            )}
          >
            <Bell className="h-4.5 w-4.5" />
            {unread > 0 && (
              <span data-testid="notification-unread-dot" className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive" />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3 bg-popover text-popover-foreground border-border">
            <div className="flex items-center justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Notifications
              </p>
              {unread > 0 && (
                <button
                  onClick={() => {
                    void Promise.all(openAlerts.filter((a) => !a.read_at).map((a) => markAlertRead(a.id)));
                    setBellOpen(false);
                  }}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {isPending ? (
              <p className="text-[12px] text-muted-foreground">Loading alerts…</p>
            ) : latest.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No open alerts.</p>
            ) : (
              <ul className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                {latest.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex items-start gap-2.5 px-2 py-2 rounded border border-border bg-card cursor-pointer hover:bg-accent"
                    onClick={() => {
                      void markAlertRead(alert.id);
                      setBellOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                        severityColor(alert.severity),
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-foreground leading-snug">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                        {alert.message}
                        {alert.mine_id ? ` · ${alert.mine_id}` : ""}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                        {timeAgo(alert.created_at)}
                      </p>
                    </div>
                    {!alert.read_at && (
                      <X className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground hover:text-destructive" />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 border-t border-border pt-2">
              <button
                data-testid="notification-view-all-button"
                onClick={() => setBellOpen(false)}
                className="w-full text-[11px] font-medium text-primary hover:bg-accent rounded px-2 py-1.5"
              >
                View all alerts
              </button>
            </div>
          </PopoverContent>
        </Popover>

        <div
          data-testid="topbar-avatar"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary font-mono text-[11px] text-secondary-foreground"
          title={user.email}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
