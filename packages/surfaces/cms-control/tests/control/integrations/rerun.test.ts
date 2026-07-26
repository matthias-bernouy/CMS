import { describe, expect, test } from "bun:test";
import { P9R_CACHE } from "@bernouy/cms-content";
import { compress } from "@bernouy/http-runner";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import postIntegrationInstallationRerun from "cms-control/api/_platform/integrations/installations/rerun.post";
import { makeCms, postImport, postRerun } from "./support/helpers";

describe("POST /api/integrations/installations/rerun", () => {
    test("reruns a tracked integration installation with stored secrets", async () => {
        const { cms, sources, cache } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        cache.set(P9R_CACHE.STYLE, compress("old-style", "text/css"));
        cache.set(P9R_CACHE.page("/cached"), compress("old-page", "text/html"));

        const res = await postIntegrationInstallationRerun(postRerun("test-secret-source"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.artifacts).toEqual([{ type: "source", id: "urn:secret-source-main", action: "updated" }]);
        expect(body.installation.runCount).toBe(2);
        expect((await sources.getSource("urn:secret-source-main"))?.endpoints).toHaveLength(1);
        expect(JSON.stringify(body)).not.toContain("sk_test");
        expect(cache.get(P9R_CACHE.STYLE)).toBeNull();
        expect(cache.get(P9R_CACHE.page("/cached"))).toBeNull();
    });

    test("accepts rerun answer overrides", async () => {
        const { cms } = makeCms();

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_old" },
            }),
            cms,
        );

        const res = await postIntegrationInstallationRerun(
            postRerun("test-secret-source", {
                answers: { apiKey: "sk_new" },
            }),
            cms,
        );
        const body = await res.json();

        expect(body.installation.runCount).toBe(2);
        expect(JSON.stringify(body)).not.toContain("sk_new");
    });

    test("invalidates Theme and page caches when a started rerun fails", async () => {
        const { cms, cache, integrationInstallations } = makeCms();
        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "secret-source-main", apiKey: "sk_test" },
            }),
            cms,
        );
        cache.set(P9R_CACHE.STYLE, compress("old-style", "text/css"));
        cache.set(P9R_CACHE.page("/cached"), compress("old-page", "text/html"));

        await expect(
            postIntegrationInstallationRerun(
                postRerun("test-secret-source", { answers: { id: "different-identity" } }),
                cms,
            ),
        ).rejects.toThrow();

        expect((await integrationInstallations.get("test-secret-source"))?.status).toBe("failed");
        expect(cache.get(P9R_CACHE.STYLE)).toBeNull();
        expect(cache.get(P9R_CACHE.page("/cached"))).toBeNull();
    });

    test("requires an integration id", async () => {
        const { cms } = makeCms();

        await expect(postIntegrationInstallationRerun(postRerun(), cms)).rejects.toThrow(/Missing param id/);
    });
});
