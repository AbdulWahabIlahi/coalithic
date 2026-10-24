import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost } from "@/lib/api";

// Feature 10 — key flow building blocks: the request layer every page uses
// (login → session cookie rides along → GET feeds → export links). fetch is
// stubbed so these tests run hermetically.

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  throwJson?: boolean;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: () => (response.throwJson ? Promise.reject(new Error("no json")) : Promise.resolve(response.json ?? {})),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api request layer", () => {
  it("GETs JSON from /api with the relative base", async () => {
    const fetchMock = stubFetch({ json: { items: [{ id: "M-001" }] } });
    const body = await apiGet<{ items: Array<{ id: string }> }>("/mines");
    expect(body.items[0].id).toBe("M-001");
    expect(fetchMock).toHaveBeenCalledWith("/api/mines", expect.objectContaining({ method: "GET" }));
  });

  it("serialises POST bodies as JSON", async () => {
    const fetchMock = stubFetch({ status: 201, json: { item: { id: "GR-1" } } });
    await apiPost("/grievances", { mine_id: "M-001", category: "safety", description: "long enough" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ mine_id: "M-001", category: "safety", description: "long enough" });
  });

  it("throws ApiError carrying the JSON detail on failure", async () => {
    stubFetch({ ok: false, status: 403, json: { detail: "not your mine" } });
    await expect(apiGet("/grievances")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      body: { detail: "not your mine" },
    });
  });

  it("tolerates empty error bodies", async () => {
    stubFetch({ ok: false, status: 500, throwJson: true });
    await expect(apiGet("/mines")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("login → session → feed flow", () => {
  it("walks auth/me then a scoped feed with one cookie-riding client", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ user: { email: "officer@coalsmart.gov", role: "Mine Officer", mine_id: "M-001" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ mine_id: "M-001", items: [{ id: "AT-1", headcount: 186 }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const me = await apiGet<{ user: { mine_id: string } }>("/auth/me");
    expect(me.user.mine_id).toBe("M-001");

    // Scoped feed: officer hits their own mine's attendance.
    const feed = await apiGet<{ items: Array<{ headcount: number }> }>(`/attendance/${me.user.mine_id}?days=14`);
    expect(feed.items[0].headcount).toBe(186);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/attendance/M-001?days=14", expect.anything());
  });
});
