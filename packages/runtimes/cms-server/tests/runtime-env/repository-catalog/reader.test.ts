import { describe, expect, test } from "bun:test";
import { HttpRepositoryCatalogReader } from "../../../src/repositoryCatalog";
import {
    catalogFixture,
    compatibilityPage,
    FixtureDefinitionRepository,
    jsonResponse,
    PACKAGE_DIGEST,
} from "./fixtures";

describe("HTTP repository catalog reader", () => {
    test("composes filter summaries and exact version details without downloading packages", async () => {
        const fixture = catalogFixture();

        const list = await fixture.reader.listIntegrations();
        const integration = await fixture.reader.getIntegration("commerce");
        const version = await fixture.reader.getVersion("commerce", "1.1.0");

        expect(list.value).toEqual([
            expect.objectContaining({
                kind: "commerce",
                category: "business",
                stable: "1.0.0",
                latest: "1.1.0",
                technicalProviders: ["stripe", "supabase"],
                artifacts: [{ type: "source", count: 2 }],
                compatibility: expect.objectContaining({ currentOutcome: "compatible" }),
                versions: [
                    expect.objectContaining({
                        version: "1.0.0",
                        package: { digest: PACKAGE_DIGEST, canonicalBytes: 2048 },
                    }),
                    expect.objectContaining({ version: "1.1.0" }),
                ],
            }),
        ]);
        expect(integration?.value.featuredVersion).toMatchObject({
            version: "1.0.0",
            releaseNotes: "# Release notes\n\nSafe Markdown.\n",
            compatibility: { currentRevisionId: "revision-1" },
        });
        expect(version?.value.version).toMatchObject({
            version: "1.1.0",
            definition: {
                kind: "commerce",
                version: "1.1.0",
                dependencies: [{ name: "Core", kind: "core", versionRange: "^1.0.0" }],
            },
            package: { digest: PACKAGE_DIGEST, canonicalBytes: 2048 },
        });
        expect(list.revision).toMatch(/^[a-f0-9]{64}$/);
        const packageRequests = fixture.requests.filter(({ url }) => url.pathname.endsWith("/package"));
        expect(packageRequests.length).toBeGreaterThan(0);
        expect(packageRequests.every(({ init }) => init?.method === "HEAD")).toBe(true);
    });

    test("returns null for an exact version absent from the immutable index", async () => {
        const fixture = catalogFixture();

        const result = await fixture.reader.getVersion("commerce", "2.0.0");

        expect(result).toBeNull();
        expect(fixture.requests).toEqual([]);
    });

    test("changes the deterministic document revision when compatibility history is appended", async () => {
        let appended = false;
        const fixture = catalogFixture({ appended: () => appended });

        const before = await fixture.reader.getVersion("commerce", "1.0.0");
        appended = true;
        const after = await fixture.reader.getVersion("commerce", "1.0.0");

        expect(before?.revision).not.toBe(after?.revision);
        expect(before?.value.version.compatibility?.currentRevisionId).toBe("revision-1");
        expect(after?.value.version.compatibility).toMatchObject({
            currentRevisionId: "revision-2",
            warning: true,
        });
    });

    test("collects compatibility pages without an unbounded page fan-out", async () => {
        const fixture = catalogFixture();
        let compatibilityRequests = 0;
        const pagedFetch: typeof fetch = async (input, init) => {
            const url = new URL(String(input));
            if (!url.pathname.endsWith("/compatibility")) {
                return await fixture.fetch(input, init);
            }
            compatibilityRequests += 1;
            const seed = compatibilityPage(url, false);
            const template = seed.revisions[0]!;
            const revisions = Array.from({ length: 101 }, (_, index) => ({
                ...template,
                id: `revision-${index + 1}`,
                supersedes: index === 0 ? seed.admission.id : `revision-${index}`,
            }));
            const secondPage = url.searchParams.has("after");
            return jsonResponse(
                {
                    admission: seed.admission,
                    current: revisions.at(-1),
                    revisions: secondPage ? revisions.slice(100) : revisions.slice(0, 100),
                    totalRevisions: revisions.length,
                    ...(secondPage ? {} : { nextCursor: "revision-100" }),
                },
                (secondPage ? "7" : "6").repeat(64),
            );
        };
        const reader = new HttpRepositoryCatalogReader({
            catalog: new FixtureDefinitionRepository(),
            baseUrl: "https://repository.example/.cms/repository",
            fetch: pagedFetch,
        });

        const result = await reader.getVersion("commerce", "1.0.0");

        expect(result?.value.version.compatibility?.revisions).toHaveLength(101);
        expect(result?.value.version.compatibility?.currentRevisionId).toBe("revision-101");
        expect(compatibilityRequests).toBe(4);
    });
});
