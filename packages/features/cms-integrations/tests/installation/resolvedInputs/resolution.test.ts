import { describe, expect, test } from "bun:test";
import { resolveTemplates, runIntegrationInstallation } from "@bernouy/cms-integrations";
import { createHarness, definition, page } from "./fixtures";

describe("@bernouy/cms-integrations resolved object-list inputs", () => {
    test("injects page content without persisting it, then re-resolves on rerun", async () => {
        const harness = createHarness();
        let revision = 1;
        harness.deps.resolvePublishedPage = async (path) => page(path, revision);

        const created = await runIntegrationInstallation({
            mode: "create",
            deps: harness.deps,
            installations: harness.installations,
            siteIntegrations: [definition()],
            dto: {
                kind: "legal-config",
                answers: { documents: [{ page: "/terms", contexts: ["checkout"], required: true }] },
                options: {},
            },
        });

        expect(harness.calls[0]).toEqual({
            documents: [{ page: page("/terms", 1), contexts: ["checkout"], required: true }],
        });
        expect(created.installation.answersSnapshot).toEqual({
            documents: [{ page: "/terms", contexts: ["checkout"], required: true }],
        });
        expect(JSON.stringify(created.installation)).not.toContain("Terms revision 1");

        revision = 2;
        await runIntegrationInstallation({
            mode: "rerun",
            deps: harness.deps,
            installations: harness.installations,
            integrationId: "legal-config",
            siteIntegrations: [definition()],
        });

        expect(harness.calls[1]).toEqual({
            documents: [{ page: page("/terms", 2), contexts: ["checkout"], required: true }],
        });
    });

    test("resolves an absent optional object-list to an empty array", async () => {
        const harness = createHarness();
        await runIntegrationInstallation({
            mode: "create",
            deps: harness.deps,
            installations: harness.installations,
            siteIntegrations: [definition()],
            dto: { kind: "legal-config", answers: {}, options: {} },
        });

        expect(harness.calls).toEqual([{ documents: [] }]);
    });

    test("supports exact structured and embedded JSON interpolation", () => {
        const context = {
            answers: {},
            resolved: { documents: [{ page: "/terms" }] },
            secrets: {},
        };
        expect(resolveTemplates({ documents: "{{json resolved.documents}}" }, context)).toEqual({
            documents: [{ page: "/terms" }],
        });
        expect(resolveTemplates("payload={{json resolved.documents}}", context)).toBe('payload=[{"page":"/terms"}]');
    });
});
