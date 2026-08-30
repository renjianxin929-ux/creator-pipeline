import { describe, expect, it } from "vitest";

import { eventRecordSchema } from "../src/contracts/event.ts";
import { mediaIdFromSha256, mediaRecordSchema } from "../src/contracts/media.ts";
import { assertTransition, createInitialState } from "../src/contracts/state.ts";

describe("P0 state contracts", () => {
  it("allows only the P0 legal transitions from CREATED", () => {
    expect(() => assertTransition("CREATED", "INGESTED")).not.toThrow();
    expect(() => assertTransition("CREATED", "WAITING_USER_ACTION")).not.toThrow();
    expect(() => assertTransition("CREATED", "WAITING_PROVIDER")).not.toThrow();
    expect(() => assertTransition("CREATED", "FAILED")).not.toThrow();
    expect(() => assertTransition("CREATED", "TRANSCRIBED")).toThrow(
      "Illegal project state transition",
    );
    expect(() => assertTransition("INGESTED", "PREVIEW_READY")).toThrow(
      "Illegal project state transition",
    );
  });

  it("creates the only valid initial state", () => {
    expect(createInitialState()).toEqual({ status: "CREATED" });
  });
});

describe("P2 state contracts", () => {
  it("opens only the transcription transitions from INGESTED", () => {
    expect(() => assertTransition("INGESTED", "TRANSCRIBED")).not.toThrow();
    expect(() => assertTransition("INGESTED", "FAILED")).not.toThrow();
    expect(() => assertTransition("INGESTED", "WAITING_USER_ACTION")).not.toThrow();
    expect(() => assertTransition("INGESTED", "PREVIEW_READY")).toThrow(
      "Illegal project state transition",
    );
  });
});

describe("event contract", () => {
  it("accepts structured operational events and rejects unbounded fields", () => {
    const event = {
      ts: "2026-08-30T00:00:00.000Z",
      stage: "init",
      event: "project_created",
      project: "demo",
    };

    expect(eventRecordSchema.parse(event)).toEqual(event);
    expect(() =>
      eventRecordSchema.parse({
        ...event,
        token: "must-not-be-persisted",
      }),
    ).toThrow();
  });
});

describe("P1 media identity contract", () => {
  const sha256 = "a".repeat(64);
  const record = {
    id: mediaIdFromSha256(sha256),
    sha256,
    byte_size: 42,
    path: "raw/camera/sha256-a.mp4",
    kind: "camera" as const,
    duration_ms: 1_000,
    fps: 30,
    codec: "h264",
    width: 1920,
    height: 1080,
    has_audio: true,
    orientation: "landscape" as const,
  };

  it("uses content-derived media IDs rather than source filenames", () => {
    expect(mediaRecordSchema.parse(record)).toEqual(record);
    expect(mediaIdFromSha256(sha256)).toBe(`sha256:${sha256}`);
  });

  it("rejects invalid normalized probe facts", () => {
    expect(() => mediaRecordSchema.parse({ ...record, id: "clip.mp4" })).toThrow(
      "id must be derived from sha256",
    );
    expect(() => mediaRecordSchema.parse({ ...record, fps: 0 })).toThrow();
    expect(() => mediaRecordSchema.parse({ ...record, orientation: "diagonal" })).toThrow();
    expect(() => mediaRecordSchema.parse({ ...record, ffprobe: {} })).toThrow();
  });
});
