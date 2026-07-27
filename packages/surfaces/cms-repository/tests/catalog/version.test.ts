import { describe, expect, test } from "bun:test";
import { RepositoryCatalogPageProvider } from "@bernouy/cms-repository/catalog";
import { catalogReader, commerceSummary, commerceVersion, document, EMPTY_CONTEXT } from "./fixtures";

describe("repository catalog integration and version pages", () => {
    test("renders channels, complete version history and featured package documentation", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());
        const result = await provider.resolvePage("/integrations/commerce", EMPTY_CONTEXT);
        const html = result?.page.content ?? "";

        expect(result?.page.path).toBe("/integrations/commerce");
        expect(html).toContain("Stable</dt><dd>1.0.0");
        expect(html).toContain("Latest</dt><dd>1.1.0");
        expect(html).toContain("/integrations/commerce/versions/1.1.0");
        expect(html).toContain("/integrations/commerce/versions/1.0.0");
        expect(html).toContain("Technical providers");
        expect(html).toContain("supabase");
        expect(html).toContain("stripe-webhooks");
        expect(html).toContain("Basic blocs");
        expect(html).toContain("^1.0.0");
        expect(html).toContain("Bloc: 2");
        expect(html).toContain("<strong>safe configuration</strong>");
        expect(html).toContain("Added checkout retries");
        expect(html).toContain("kind=commerce&amp;version=1.1.0");
        expect(html).toContain("2.0 KiB");
    });

    test("renders the exact compatibility history, package identity and canonical page path", async () => {
        const provider = new RepositoryCatalogPageProvider(catalogReader());
        const result = await provider.resolvePage("/integrations/commerce/versions/1.1.0", EMPTY_CONTEXT);
        const html = result?.page.content ?? "";

        expect(result?.page.path).toBe("/integrations/commerce/versions/1.1.0");
        expect(result?.page.title).toBe("Commerce 1.1.0");
        expect(html).toContain("Root report");
        expect(html).toContain("Reassessment (current)");
        expect(html).toContain("revision-2");
        expect(html).toContain("A public bloc was added.");
        expect(html).toContain("cms-compatibility 1.0.0");
        expect(html).toContain("commerce@1.0.0");
        expect(html).toContain("Comparator update");
        expect(html).toContain("a".repeat(64));
        expect(html).toContain("Download commerce@1.1.0");
        expect(html).toContain("Release admission");
        expect(html).toContain("Legacy backfill");
        expect(html).toContain("cms-schema-generator");
        expect(html).toContain("2026-07-26T10:00:00.000Z");
        expect(html).toContain("public-api@1.0.0");
        expect(html).toContain("sql-install-and-reapply");
        expect(html).toContain("12 ms");
        expect(html).toContain("verification-bundle?digest=");
        expect(html).toContain("cms-postgres-migration");
        expect(html).toContain("sha256:migration");
        expect(html).toContain("Fresh Install");
        expect(html).toContain("Equivalence");
        expect(html).toContain("Provider-direct cutover");
        expect(html).toContain("Not supported: declared, but not executed by the current runner");
        expect(html).toContain("Activation / cleanup execution</dt><dd>Not applicable");
        expect(html).toContain("SQL migration / equivalence outcome");
        expect(html).toContain("Not measured by the current verifier");
        expect(html).toContain("CMS-mediated 30s");
        expect(html).toContain("Rollback proof");
        expect(html).toContain("PONR observation");
    });

    test("changes cache identity whenever the reader revision changes", async () => {
        const first = await new RepositoryCatalogPageProvider(catalogReader({}, "revision-1")).resolvePage(
            "/integrations/commerce/versions/1.1.0",
            EMPTY_CONTEXT,
        );
        const second = await new RepositoryCatalogPageProvider(catalogReader({}, "revision-2")).resolvePage(
            "/integrations/commerce/versions/1.1.0",
            EMPTY_CONTEXT,
        );

        expect(first?.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
        expect(second?.cacheIdentity).toMatch(/^[a-f0-9]{64}$/);
        expect(first?.cacheIdentity).not.toBe(second?.cacheIdentity);
    });

    test("keeps legacy versions useful when optional package metadata and reports are absent", async () => {
        const integration = commerceSummary();
        const full = commerceVersion("1.0.0");
        const provider = new RepositoryCatalogPageProvider(
            catalogReader({
                getVersion: async () =>
                    document({
                        integration,
                        version: { version: full.version, definition: full.definition },
                    }),
            }),
        );

        const result = await provider.resolvePage("/integrations/commerce/versions/1.0.0", EMPTY_CONTEXT);

        expect(result?.status).toBeUndefined();
        expect(result?.page.content).toContain("Unavailable for this legacy version");
        expect(result?.page.content).toContain("No release notes are available");
        expect(result?.page.content).toContain("No compatibility report is available");
    });
});
