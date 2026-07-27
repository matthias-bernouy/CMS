import { describe, expect, test } from "bun:test";
import { generateBindingCoreJsEntry } from "cms-delivery/core/assets/buildBindingCore";

describe("delivery system runtime asset", () => {
    test("bundles only the technical binding runtime", async () => {
        const entry = await generateBindingCoreJsEntry();
        const source = new TextDecoder().decode(entry.raw);

        expect(source).toContain("cms-binding-core");
        expect(source).not.toContain("cms-signup-legal-consent");
        expect(source).not.toContain("cms-login-methods");
        expect(source).not.toContain("node:crypto");
        expect(source).not.toContain("mongodb");
    });
});
