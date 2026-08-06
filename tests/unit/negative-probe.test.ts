import { describe, expect, it } from "vitest";

describe("negative probe for M0-046", () => {
  it("must fail so that m0 / pr-quick cannot pass", () => {
    expect(1).toBe(2);
  });
});
