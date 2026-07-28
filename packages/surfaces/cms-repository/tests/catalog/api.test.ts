import { describe, expect, test } from "bun:test";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { RepositoryCms } from "cms-repository/RepositoryCms";
import { catalogReader, commerceVersion, document } from "./fixtures";
import { TestRunner } from "../testRunner";

const PATH = "/api/integrations/catalog";

describe("repository catalog JSON API", () => {
    test("projects a binding-friendly filtered list", async () => {
        const runner = configuredRunner();
        const response = await runner.handle(`${PATH}?provider=stripe-webhooks`);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.schema).toBe("cms.repository.catalog.v1");
        expect(body.view).toBe("list");
        expect(body.provider).toBe("stripe-webhooks");
        expect(body.count).toBe(1);
        expect(body.total).toBe(2);
        expect(body.providers).toContainEqual({ value: "stripe-webhooks", label: "Stripe webhooks" });
        expect(body.integrations).toHaveLength(1);
        expect(body.integrations[0]).toMatchObject({
            kind: "commerce",
            detailsUrl: "/integrations?kind=commerce",
            compatibilityOutcome: "compatible",
        });
        expect(body.integrations[0].technicalProviders).toContainEqual({ name: "supabase", label: "Supabase" });
        expect(body.integrations[0].versions[0]).toMatchObject({
            version: "1.1.0",
            isLatest: true,
            downloadUrl: "/.cms/repository/api/integrations/package?kind=commerce&version=1.1.0",
            detailsUrl: "/integrations?kind=commerce&version=1.1.0",
        });
    });

    test("keeps all existing list filters bounded and case-insensitive", async () => {
        for (const [query, expected] of [
            ["q=CHECKOUT", "commerce"],
            ["category=marketing", "newsletter"],
            ["provider=SUPABASE", "commerce"],
            ["compatibility=not-applicable", "newsletter"],
        ] as const) {
            const body = await (await configuredRunner().handle(`${PATH}?${query}`)).json();
            expect(body.integrations.map(({ kind }: { kind: string }) => kind)).toContain(expected);
        }
        const oversized = "x".repeat(256);
        const body = await (await configuredRunner().handle(`${PATH}?q=${oversized}`)).json();
        expect(body.q).toBe("x".repeat(128));
    });

    test("projects integration and exact version views without record-shaped repeat data", async () => {
        const runner = configuredRunner();
        const integration = await (await runner.handle(`${PATH}?kind=commerce`)).json();
        const version = await (await runner.handle(`${PATH}?kind=commerce&version=1.1.0`)).json();

        expect(integration).toMatchObject({
            schema: "cms.repository.catalog.v1",
            view: "integration",
            kind: "commerce",
            label: "Commerce",
        });
        expect(integration.featuredVersion.detailsUrl).toBe("/integrations?kind=commerce&version=1.1.0");
        expect(integration.featuredVersion.instructions[0].html).toContain("<strong>safe configuration</strong>");
        expect(version).toMatchObject({
            view: "version",
            kind: "commerce",
            version: "1.1.0",
            isLatest: true,
            packageBytes: 2_048,
            packageSize: "2.0 KiB",
            integrationUrl: "/integrations?kind=commerce",
        });
        expect(version.compatibility.current.reportId).toBe("revision-2");
        expect(version.release.verification.environment.versions).toEqual([
            { name: "bun", version: "1.3.14" },
            { name: "postgres", version: "16.9" },
        ]);
        expect(version.release.migrations[0].checks).toEqual([
            { name: "equivalence", outcome: "passed", evidenceDigest: "a".repeat(64) },
            { name: "freshInstall", outcome: "passed", evidenceDigest: "f".repeat(64) },
        ]);
        expect(version.release.verificationBundleUrl).toContain("verification-bundle?digest=");
    });

    test("renders untrusted Markdown only through the shared sanitizer", async () => {
        const hostile = {
            ...commerceVersion(),
            releaseNotes: "<script>alert(1)</script> [bad](javascript:alert(2))",
            definition: {
                ...commerceVersion().definition,
                ui: { instructions: [["Unsafe", '<img src=x onerror="alert(3)">']] },
            },
        };
        const runner = configuredRunner(
            catalogReader({
                getVersion: async () =>
                    document({
                        integration: (await catalogReader().getIntegration("commerce"))!.value.integration,
                        version: hostile,
                    }),
            }),
        );
        const body = await (await runner.handle(`${PATH}?kind=commerce&version=1.1.0`)).json();

        expect(body.releaseNotesHtml).not.toContain("<script");
        expect(body.releaseNotesHtml).not.toContain('href="javascript:');
        expect(body.releaseNotesHtml).toContain("&lt;script&gt;");
        expect(body.instructions[0].html).not.toMatch(/<[^>]+onerror=/i);
        expect(body.instructions[0].html).toContain("&lt;img");
    });

    test("supports HEAD, ETag revalidation and CORS OPTIONS", async () => {
        const runner = configuredRunner();
        const get = await runner.handle(PATH);
        const head = await runner.handle(PATH, { method: "HEAD" });
        const notModified = await runner.handle(PATH, { headers: { "if-none-match": get.headers.get("etag")! } });
        const options = await runner.handle(PATH, { method: "OPTIONS" });

        expect(head.status).toBe(200);
        expect(head.headers.get("content-length")).toBe(get.headers.get("content-length"));
        expect(head.headers.get("etag")).toBe(get.headers.get("etag"));
        expect(get.headers.get("access-control-allow-origin")).toBe("*");
        expect(await head.text()).toBe("");
        expect(notModified.status).toBe(304);
        expect(options.status).toBe(204);
        expect(options.headers.get("access-control-allow-origin")).toBe("*");
        expect(options.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
    });

    test("rejects ambiguous, unsupported and invalid selectors", async () => {
        for (const query of [
            "version=1.0.0",
            "kind=../commerce",
            "kind=commerce&version=latest",
            "kind=commerce&kind=newsletter",
            "unknown=value",
        ]) {
            const response = await configuredRunner().handle(`${PATH}?${query}`);
            expect(response.status).toBe(400);
            expect(response.headers.get("cache-control")).toBe("no-store");
        }
    });

    test("returns public 404 and fail-closed 502 responses", async () => {
        const missing = await configuredRunner().handle(`${PATH}?kind=missing`);
        const invalid = await configuredRunner(
            catalogReader({
                listIntegrations: async () =>
                    document([
                        {
                            kind: "commerce",
                            label: "x".repeat(2_000),
                            versions: [{ version: "1.0.0" }],
                        },
                    ]),
            }),
        ).handle(PATH);

        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: "integration not found" });
        expect(invalid.status).toBe(502);
        expect(await invalid.json()).toEqual({ error: "integration label must be a bounded string" });
    });
});

function configuredRunner(repositoryCatalog = catalogReader()): TestRunner {
    const runner = new TestRunner();
    new RepositoryCms({ runner, integrationCatalog: unusedIntegrationCatalog(), repositoryCatalog });
    return runner;
}

function unusedIntegrationCatalog(): IntegrationDefinitionRepository {
    return {
        list: async () => [],
        getIndex: async () => null,
        listVersions: async () => [],
        get: async () => null,
    };
}
