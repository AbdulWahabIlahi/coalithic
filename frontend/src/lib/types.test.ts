import { describe, expect, it } from "vitest";
import { RISK_COLORS, riskBand } from "@/lib/types";

describe("riskBand", () => {
  it("maps scores below 40 to low", () => {
    expect(riskBand(0)).toBe("low");
    expect(riskBand(39)).toBe("low");
  });
  it("maps 40–69 to watch", () => {
    expect(riskBand(40)).toBe("watch");
    expect(riskBand(69)).toBe("watch");
  });
  it("maps 70+ to high", () => {
    expect(riskBand(70)).toBe("high");
    expect(riskBand(100)).toBe("high");
  });
  it("has a color for every band", () => {
    expect(RISK_COLORS.low).toBeTruthy();
    expect(RISK_COLORS.watch).toBeTruthy();
    expect(RISK_COLORS.high).toBeTruthy();
  });
});
