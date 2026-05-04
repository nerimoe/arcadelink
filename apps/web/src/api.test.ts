import { describe, expect, it } from "vitest";

describe("web app", () => {
  it("has a test harness", () => {
    expect("ArcadeLink").toContain("Link");
  });
});
