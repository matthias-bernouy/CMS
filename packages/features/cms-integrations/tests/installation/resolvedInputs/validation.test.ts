import { describe, expect, test } from "bun:test";
import { runIntegrationInstallation } from "@bernouy/cms-integrations";
import { createHarness, definition } from "./fixtures";

describe("@bernouy/cms-integrations resolved page validation", () => {
    test.each(["missing", "draft"] as const)("rejects a %s page before artifact writes", async () => {
        const harness = createHarness();
        harness.deps.resolvePublishedPage = async () => null;

        await expect(
            runIntegrationInstallation({
                mode: "create",
                deps: harness.deps,
                installations: harness.installations,
                siteIntegrations: [definition()],
                dto: {
                    kind: "legal-config",
                    answers: { documents: [{ page: "/terms", contexts: ["checkout"], required: true }] },
                    options: {},
                },
            }),
        ).rejects.toThrow(/missing or not published/);

        expect(await harness.sources.getSource("urn:legal-config")).toBeNull();
        expect(await harness.installations.get("legal-config")).toBeNull();
        expect(harness.calls).toEqual([]);
    });
});
