import { describe, expect, it } from "vitest";
import { publicToolUrl } from "../lib/wheel/public-url";

describe("PDF public start-page link", () => {
  it("leaves an unconfigured URL unavailable instead of inventing an address", () => {
    expect(publicToolUrl("")).toBeNull();
  });
  it("accepts only the HTTPS start page", () => {
    expect(publicToolUrl("https://example.org")).toBe("https://example.org/");
  });
  it("rejects session identifiers and secret access parameters", () => {
    expect(publicToolUrl("https://example.org/s/client-id#k=client-secret")).toBeNull();
    expect(publicToolUrl("https://example.org/?access=client-secret")).toBeNull();
    expect(publicToolUrl("https://example.org/#k=client-secret")).toBeNull();
    expect(publicToolUrl("https://user:secret@example.org/")).toBeNull();
  });
});