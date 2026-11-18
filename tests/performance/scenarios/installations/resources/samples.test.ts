import { expect, test } from "bun:test";
import { sampleResourceIdentity } from "./samples";

test("sequential sample resources cannot collide and version pairs stay within one bounded publisher", () => {
    const ids = Array.from({ length: 32 }, (_, index) => sampleResourceIdentity("apply-http-warm", index));
    expect(new Set(ids.map((row) => row.name)).size).toBe(32);
    expect(new Set(ids.map((row) => row.bucket)).size).toBe(2);
    expect(ids[15]!.bucket).not.toBe(ids[16]!.bucket);
    expect(sampleResourceIdentity("apply-http-warm", 0).bucket).not.toBe(
        sampleResourceIdentity("apply-mcp-warm", 0).bucket,
    );
    for (const index of [-1, 256, 1.5, NaN, Infinity]) {
        expect(() => sampleResourceIdentity("sample", index)).toThrow();
    }
});
