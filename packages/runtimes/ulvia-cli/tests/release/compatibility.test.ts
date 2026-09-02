import { describe, expect, test } from "bun:test";
import { assertLocalCompatibility, evaluateLocalCompatibility } from "../../src/release/compatibility";
import { releasePackage } from "./support";

describe("local release compatibility", () => {
    test("rejects a breaking patch before runtime verification", async () => {
        const baseline = await releasePackage("1.0.0");
        const candidate = await releasePackage("1.0.1", {
            inputs: [{ name: "account", label: "Account", type: "text", required: true }],
        });
        const result = evaluateLocalCompatibility(candidate, [baseline]);

        expect(result).toMatchObject({ contractAdmissible: false, requiredReleaseLevel: "major" });
        expect(() => assertLocalCompatibility(result)).toThrow(/requires a major version/);
    });
});
