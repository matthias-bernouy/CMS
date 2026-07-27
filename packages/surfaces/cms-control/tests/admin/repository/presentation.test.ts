import { afterEach, describe, expect, test } from "bun:test";
import staticPage from "../../../src/static/admin/_operations/repository.html" with { type: "text" };
import {
    installRepositoryFetch,
    loadCommerce,
    mountRepositoryConsole,
    required,
    resetRepositoryDom,
    selectCurrentVersion,
} from "./fixtures";

afterEach(resetRepositoryDom);

describe("repository administration presentation", () => {
    test("renders health, diagnostics, quarantine, channels, digests, and compatibility history safely", async () => {
        const calls = installRepositoryFetch();
        const console = await mountRepositoryConsole();

        expect(console.textContent).toContain("14");
        expect(console.textContent).toContain("invalid-package");
        expect(console.textContent).toContain("broken");
        expect(console.textContent).toContain("Recovered safely");
        expect(console.textContent).toContain("Registry capacity");
        expect(console.textContent).toContain("4 downloads / 4.0 KiB");
        expect(console.textContent).toContain("6/8 succeeded");
        expect(console.textContent).toContain("1 not found");
        expect(console.textContent).toContain("publication: succeeded");
        expect(console.textContent).toContain("publication-operation");
        expect(console.textContent).toContain("A <script>alert(1)</script> package failed");
        expect(console.querySelector("script")).toBeNull();

        await loadCommerce(console);
        expect(console.textContent).toContain("stable 1.0.0");
        expect(console.textContent).toContain("latest 1.1.0");
        expect(console.textContent).toContain("b".repeat(64));

        await selectCurrentVersion(console);
        expect(console.textContent).toContain("Composite decision: admissible");
        expect(console.textContent).toContain("legacy-backfill");
        expect(console.textContent).toContain("Created 2026-07-26T10:00:00.000Z");
        expect(console.textContent).toContain("Runner cms-postgres 1.0.0");
        expect(console.textContent).toContain("postgres 16.4");
        expect(console.textContent).toContain("public-api@1.0.0");
        expect(console.textContent).toContain("sql-install-and-reapply");
        expect(console.textContent).toContain("sql-reapply-drift");
        expect(console.textContent).toContain("Second install changed <script>protected_schema</script>");
        expect(console.textContent).toContain("8 ms");
        expect(console.textContent).toContain("Verification bundle digest");
        expect(console.textContent).toContain("cms-postgres-migration");
        expect(console.textContent).toContain("freshInstall · passed");
        expect(console.textContent).toContain("equivalence · passed");
        expect(console.textContent).toContain("Provider-direct expand-in-code");
        expect(console.textContent).toContain("Downtime not measured by the current verifier");
        expect(console.textContent).toContain("CMS drain 30s");
        expect(console.textContent).toContain("Rollback proof verified");
        expect(console.textContent).toContain("PONR observation crossed");
        expect(console.textContent).toContain("Exact downloads and pinned reruns remain available");
        expect(console.textContent).toContain("Revision history (1)");
        expect(console.textContent).toContain("ci-schema-42");
        expect(console.textContent).toContain("Reviewed <script>unsafe()</script> evidence");
        expect(console.textContent).toContain("Literal <img src=x onerror=alert(1)> evidence");
        expect(console.querySelector("script")).toBeNull();
        expect(console.querySelector('img[src="x"]')).toBeNull();
        expect(console.textContent).not.toContain("repository-owner@example.test");
        expect(console.textContent).not.toContain("/private/schema.sql");
        expect(console.textContent).not.toContain("repository.internal");

        expect(calls.every((call) => call.url.pathname.startsWith("/cms/api/repository/"))).toBe(true);
        expect(calls.some((call) => /token|authorization|repository\.internal/iu.test(JSON.stringify(call.init)))).toBe(
            false,
        );
    });

    test("ships a distinct static repository page", () => {
        const page = staticPage as unknown as string;
        expect(page).toContain("Integration repository");
        expect(page).toContain("<cms-repository-admin>");
        expect(page).not.toContain("script");
        expect(required).toBeFunction();
    });
});
