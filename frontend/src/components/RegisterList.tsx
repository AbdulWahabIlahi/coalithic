import { ChevronRight, FileText, HardHat, ShieldCheck } from "lucide-react";
import type { RegisterRow } from "@/lib/demo";

const ICONS = {
  report: FileText,
  shield: ShieldCheck,
  hardhat: HardHat,
} as const;

const TILE_TONES = {
  amber: "bg-accent text-accent-foreground",
  teal: "bg-accent text-primary",
} as const;

const BADGE_TONES = {
  amber: "border-border bg-secondary text-accent-foreground",
  teal: "border-border bg-card text-primary",
} as const;

// The list-card shared by Compliance register, Contractors and Reports & audit.
export default function RegisterList({ rows, testPrefix }: { rows: RegisterRow[]; testPrefix: string }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm" data-testid={`${testPrefix}-list`}>
      {rows.map((row) => {
        const Icon = ICONS[row.icon];
        // Titles legitimately repeat across mines — key on the backend id when
        // live, on the (unique) demo title otherwise.
        const rowKey = row.id ?? row.title;
        const testSlug = row.id
          ? row.id.toLowerCase()
          : row.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return (
          <button
            key={rowKey}
            data-testid={`${testPrefix}-row-${testSlug}`}
            className="group flex w-full items-center gap-4 border-b border-border px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-secondary"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TILE_TONES[row.tone]}`}>
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-foreground">{row.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>
            </span>
            <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] ${BADGE_TONES[row.tone]}`}>
              {row.badge}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        );
      })}
    </div>
  );
}
