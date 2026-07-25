import { describe, expect, test } from "bun:test";
import { generateBindingCoreJsEntry } from "cms-delivery/core/assets/buildBindingCore";

describe("delivery system runtime asset", () => {
    test("bundles the signup legal consent browser component without server adapters", async () => {
        const entry = await generateBindingCoreJsEntry();
        const source = new TextDecoder().decode(entry.raw);

        expect(source).toContain("cms-signup-legal-consent");
        expect(source).toContain("signupLegalRequirements");
        expect(source).not.toContain("node:crypto");
        expect(source).not.toContain("mongodb");
    });
});
