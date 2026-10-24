import { describe, expect, it } from "vitest";
import { signalText, RISK_LABEL } from "@/lib/demo";
import { patternHeadline, type RiskPattern } from "@/lib/risk";
import { headcountTrend, type AttendanceRecord } from "@/lib/attendance";
import { grievanceStatusTone, slaLabel, type Grievance } from "@/lib/grievances";

describe("signalText", () => {
  it("flags high-risk scores", () => {
    expect(signalText(70)).toContain("violations");
    expect(signalText(95)).toContain("violations");
  });
  it("keeps routine copy below the high band", () => {
    expect(signalText(69)).toBe("Routine compliance signal");
    expect(signalText(0)).toBe("Routine compliance signal");
  });
});

describe("RISK_LABEL", () => {
  it("labels every band", () => {
    expect(RISK_LABEL.low).toBeTruthy();
    expect(RISK_LABEL.watch).toBeTruthy();
    expect(RISK_LABEL.high).toBeTruthy();
  });
});

describe("patternHeadline", () => {
  it("returns null for missing patterns", () => {
    expect(patternHeadline(null)).toBeNull();
    expect(patternHeadline(undefined)).toBeNull();
  });
  it("builds a headline from a live pattern", () => {
    const pattern: RiskPattern = {
      id: "P-1",
      section: "Section 4",
      mine_ids: ["M-001", "M-002", "M-003"],
      contractor_ids: ["C-01", "C-02"],
      violation_count: 4,
      first_seen: "2026-10-01",
      last_seen: "2026-10-20",
    };
    const headline = patternHeadline(pattern);
    expect(headline?.title).toContain("Section 4");
    expect(headline?.title).toContain("3 mine");
    expect(headline?.body).toContain("C-01, C-02");
  });
});

function att(day: string, headcount: number): AttendanceRecord {
  return {
    id: `AT-${day}`, mine_id: "M-001", mine_name: "Singrauli North",
    work_date: day, workers_in: headcount, workers_out: headcount, headcount,
    recorded_by: "test", created_at: `${day}T09:00:00Z`,
  };
}

describe("headcountTrend", () => {
  it("is flat when there is no history", () => {
    expect(headcountTrend([])).toEqual({ direction: "flat", pct: 0 });
    expect(headcountTrend([att("2026-10-20", 100)])).toEqual({ direction: "flat", pct: 0 });
  });
  it("detects a rise", () => {
    const t = headcountTrend([att("2026-10-19", 100), att("2026-10-20", 110)]);
    expect(t.direction).toBe("up");
    expect(t.pct).toBeCloseTo(10, 1);
  });
  it("detects a drop regardless of input order", () => {
    const t = headcountTrend([att("2026-10-20", 90), att("2026-10-19", 100)]);
    expect(t.direction).toBe("down");
  });
});

const grievance = (over: Partial<Grievance>): Pick<Grievance, "status" | "sla_breached" | "sla_remaining_hours"> => ({
  status: "open", sla_breached: false, sla_remaining_hours: 24, ...over,
});

describe("grievance SLA helpers", () => {
  it("labels remaining hours, breaches and closures", () => {
    expect(slaLabel(grievance({ sla_remaining_hours: 12 }))).toBe("in 12h");
    expect(slaLabel(grievance({ sla_breached: true, sla_remaining_hours: -10 }))).toBe("breached 10h ago");
    expect(slaLabel(grievance({ status: "resolved", sla_remaining_hours: null }))).toBe("closed");
  });
  it("tones status by breach", () => {
    expect(grievanceStatusTone(grievance({}))).toContain("accent");
    expect(grievanceStatusTone(grievance({ sla_breached: true }))).toContain("destructive");
    expect(grievanceStatusTone(grievance({ status: "resolved" }))).toContain("accent");
    expect(grievanceStatusTone(grievance({ status: "in_review" }))).toContain("primary");
  });
});
