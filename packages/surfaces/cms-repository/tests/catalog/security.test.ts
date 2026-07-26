import { describe, expect, test } from "bun:test";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { catalogReader, commerceSummary, commerceVersion, document, EMPTY_CONTEXT } from "./fixtures";

describe("repository catalog rendering safety", () => {
    test("escapes repository fields and sanitizes release notes and instructions", async () => {
        const integration = {
            ...commerceSummary(),
            label: '<img src=x onerror="alert(1)">',
            description: "</p><script>alert(2)</script>",
            category: '<svg onload="alert(3)">',
            technicalProviders: ['provider"><iframe srcdoc="bad">'],
            artifacts: [{ type: '<img onerror="bad">', count: 1 }],
        };
        const version = {
            ...commerceVersion(),
            definition: {
                ...commerceVersion().definition,
                label: integration.label,
                dependencies: [
                    { name: '<script id="dependency">bad</script>', kind: "safe-kind", versionRange: '" onclick="bad' },
                ],
                ui: {
                    instructions: [
                        ["Unsafe <img onerror=bad>", "<script>alert(4)</script> [bad](javascript:alert(5))"],
                    ],
                },
            },
            releaseNotes: '<img src=x onerror="alert(6)">\n\n[bad](javascript:alert(7))',
            compatibility: {
                ...commerceVersion().compatibility!,
                admission: {
                    ...commerceVersion().compatibility!.admission,
                    evidence: [
                        {
                            classification: "breaking",
                            surface: "definition",
                            code: "unsafe",
                            path: '<img onerror="bad">',
                            message: '<script id="evidence">bad</script>',
                        },
                    ],
                },
            },
        };
        const reader = catalogReader({
            getVersion: async () => document({ integration, version }, "unsafe-revision"),
        });
        const result = await new RepositoryCatalogPageProvider(reader).resolvePage(
            "/integrations/commerce/versions/1.1.0",
            EMPTY_CONTEXT,
        );
        const html = result?.page.content ?? "";

        expect(html).not.toContain("<script");
        expect(html).not.toContain("<iframe");
        expect(html).not.toMatch(/<[^>]+\son(?:error|load)=/i);
        expect(html).not.toContain('href="javascript:');
        expect(html).not.toMatch(/<[^>]+\sonclick=/i);
        expect(html).toContain("&lt;script");
        expect(html).toContain("&lt;img");
    });
});
