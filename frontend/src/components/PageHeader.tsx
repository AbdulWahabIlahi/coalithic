import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  sub: string;
  action?: ReactNode;
}

// Shared section header: teal mono eyebrow, large light title, muted sub, action right.
export default function PageHeader({ eyebrow, title, sub, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          {eyebrow}
        </p>
        <h1 className="text-[30px] font-light leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}