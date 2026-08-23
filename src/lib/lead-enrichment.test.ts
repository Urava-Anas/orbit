import { describe, expect, it } from "vitest";
import { enrichPublicBusinessContact } from "./lead-enrichment";

describe("enrichPublicBusinessContact", () => {
  it("preserves provider contact data when no website is available", async () => {
    const result = await enrichPublicBusinessContact({
      phone: "+1 636 337 5152",
      email: "hello@example.com",
      website: null,
    });
    expect(result.phone).toBe("+1 636 337 5152");
    expect(result.email).toBe("hello@example.com");
    expect(result.status).toBe("partial");
  });
});
