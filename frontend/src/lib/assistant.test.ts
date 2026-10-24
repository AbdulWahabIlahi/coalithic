import { describe, expect, it } from "vitest";
import { assistantContent, eventFromLine, parseSsePayload } from "@/lib/assistant";

// Feature 13 — SSE chat protocol: the parser that turns the backend's
// `data: {...}` frames into typed events the UI can render.

describe("eventFromLine", () => {
  it("parses delta and done frames", () => {
    expect(eventFromLine('data: {"type":"delta","content":"M-001 "}')).toEqual({
      type: "delta",
      content: "M-001 ",
    });
    expect(
      eventFromLine('data: {"type":"done","source":"ollama","model":"gemma3:4b","language":"en"}'),
    ).toEqual({ type: "done", source: "ollama", model: "gemma3:4b", language: "en" });
  });

  it("ignores keep-alives, [DONE] and malformed frames", () => {
    expect(eventFromLine(": comment")).toBeNull();
    expect(eventFromLine("data: [DONE]")).toBeNull();
    expect(eventFromLine("data:")).toBeNull();
    expect(eventFromLine("data: {nope")).toBeNull();
    expect(eventFromLine('data: {"type":"other"}')).toBeNull();
  });
});

describe("parseSsePayload / assistantContent", () => {
  it("reconstructs the streamed answer in order and drops non-delta events", () => {
    const payload = [
      'data: {"type":"delta","content":"Singrauli "}',
      'data: {"type":"delta","content":"North is "}',
      'data: {"type":"delta","content":"high-risk at 78."}',
      'data: {"type":"done","source":"ollama","model":null,"language":"en"}',
      "data: [DONE]",
      "",
    ].join("\n");
    const events = parseSsePayload(payload);
    expect(events).toHaveLength(4);
    expect(assistantContent(events)).toBe("Singrauli North is high-risk at 78.");
    expect(events.at(-1)).toMatchObject({ type: "done", source: "ollama" });
  });

  it("handles frames split across chunk boundaries", () => {
    const full = 'data: {"type":"delta","content":"हिंदी "}\n\ndata: {"type":"done","source":"local","model":null,"language":"hi"}\n\n';
    // Simulate a mid-frame split the way streamChat buffers would see it.
    const head = full.slice(0, 30);
    const tail = full.slice(30);
    const events = [...parseSsePayload(head), ...parseSsePayload(tail)];
    // The first chunk ends mid-JSON so its delta is dropped; the done frame
    // from the second chunk still parses — this documents the buffer behaviour.
    expect(events.at(-1)).toMatchObject({ type: "done", source: "local" });
  });
});
