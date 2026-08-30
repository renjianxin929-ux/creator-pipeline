import { describe, expect, it } from "vitest";

import { eventRecordSchema } from "../src/contracts/event.ts";
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
  });

  it("creates the only valid initial state", () => {
    expect(createInitialState()).toEqual({ status: "CREATED" });
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
