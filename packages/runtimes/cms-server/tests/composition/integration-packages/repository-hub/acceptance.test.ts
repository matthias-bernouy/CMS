import { afterEach, describe, expect, test } from "bun:test";
import type { RepositoryHubSurfaces } from "./cmsSurfaces";
import { startRepositoryHubSurfaces } from "./cmsSurfaces";
import type { RepositoryProcess } from "./repositoryProcess";
import { startRepositoryProcess } from "./repositoryProcess";
import { assertBrowserBoundary, controlRequest } from "./httpBoundary";

let repository: RepositoryProcess | undefined;
let cms: RepositoryHubSurfaces | undefined;

afterEach(async () => {
    await cms?.stop();
    await repository?.dispose();
    cms = undefined;
    repository = undefined;
});

describe("repository hub CMS process acceptance", () => {
    test("keeps the CMS-authored facade public without mounting management in Control", async () => {
        repository = await startRepositoryProcess();
        const publicBaseUrl = `${repository.publicOrigin}/.cms/repository`;
        cms = await startRepositoryHubSurfaces({
            publicRepositoryBaseUrl: publicBaseUrl,
        });

        const anonymousCatalog = await fetch(`${cms.deliveryOrigin}/.cms/repository/api/integrations`);
        expect(anonymousCatalog.status).toBe(200);
        const initialCatalog = (await anonymousCatalog.json()) as Array<{ kind: string; versions: string[] }>;
        expect(initialCatalog).toHaveLength(14);
        expect(initialCatalog).toContainEqual(expect.objectContaining({ kind: "commerce", versions: ["1.0.0"] }));
        expect(anonymousCatalog.headers.get("access-control-allow-origin")).toBe("*");
        const catalogView = await fetch(`${cms.deliveryOrigin}/.cms/repository/api/integrations/catalog`);
        expect(catalogView.status).toBe(200);
        expect(catalogView.headers.get("access-control-allow-origin")).toBe("*");
        expect(await catalogView.json()).toMatchObject({
            schema: "cms.repository.catalog.v1",
            view: "list",
            count: 14,
            total: 14,
            integrations: expect.arrayContaining([expect.objectContaining({ kind: "commerce" })]),
        });
        const releaseResponse = await fetch(
            `${cms.deliveryOrigin}/.cms/repository/api/integrations/release?kind=commerce&version=1.0.0`,
        );
        expect(releaseResponse.status).toBe(200);
        expect(releaseResponse.headers.get("access-control-allow-origin")).toBe("*");
        const releaseText = await releaseResponse.text();
        const release = JSON.parse(releaseText) as { verificationDigest: string; verification: { origin: string } };
        expect(release.verification).toMatchObject({ origin: "legacy-backfill" });
        expect(release.verificationDigest).toMatch(/^[a-f0-9]{64}$/);
        const verificationResponse = await fetch(
            `${cms.deliveryOrigin}/.cms/repository/api/integrations/verification-bundle?digest=${release.verificationDigest}`,
        );
        expect(verificationResponse.status).toBe(200);
        expect(verificationResponse.headers.get("etag")).toBe(`"${release.verificationDigest}"`);
        expect(verificationResponse.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(verificationResponse.headers.get("access-control-allow-origin")).toBe("*");
        const verificationText = await verificationResponse.text();
        expect(JSON.parse(verificationText)).toMatchObject({
            schema: "cms.integration.verification.v1",
            target: { kind: "commerce", version: "1.0.0" },
        });
        expect((await fetch(`${cms.deliveryOrigin}/.cms/repository-management/api/status`)).status).toBe(404);
        expect((await fetch(`${repository.publicOrigin}/.cms/repository-management/api/status`)).status).toBe(404);
        expect((await fetch(`${repository.managementOrigin}/.cms/repository/api/integrations`)).status).toBe(404);

        const removedApi = await controlRequest(cms.controlOrigin, "/api/repository/status", "owner");
        expect(removedApi.status).toBe(404);
        const adminPage = await controlRequest(cms.controlOrigin, "/admin/repository", "owner");
        expect(adminPage.status).toBe(404);
        const adminHtml = await adminPage.text();
        expect(adminHtml).not.toContain("Integration repository");

        const relayedCatalog = await fetch(`${cms.deliveryOrigin}/.cms/repository/api/integrations`);
        expect(relayedCatalog.status).toBe(200);
        const publishedCatalog = (await relayedCatalog.json()) as Array<{ kind: string; versions: string[] }>;
        expect(publishedCatalog).toHaveLength(14);
        expect(publishedCatalog).not.toContainEqual(expect.objectContaining({ kind: "remote-demo" }));
        const packageResponse = await fetch(
            `${cms.deliveryOrigin}/.cms/repository/api/integrations/package?kind=remote-demo&version=1.0.0`,
        );
        expect(packageResponse.status).toBe(404);
        const packageText = await packageResponse.text();
        const catalogPage = await fetch(`${cms.deliveryOrigin}/integrations`);
        expect(catalogPage.status).toBe(200);
        const catalogHtml = await catalogPage.text();
        expect(catalogHtml).toContain("CMS_REPOSITORY_HUB");
        expect(catalogHtml).not.toContain("Remote demo");
        assertBrowserBoundary(cms, repository, [adminHtml, releaseText, verificationText, packageText, catalogHtml]);

        await repository.stop();
        const unavailableCatalog = await fetch(`${cms.deliveryOrigin}/.cms/repository/api/integrations/catalog`);
        expect(unavailableCatalog.status).toBe(503);
        const availableHub = await fetch(`${cms.deliveryOrigin}/integrations`);
        expect(availableHub.status).toBe(200);
        expect(await availableHub.text()).toContain("CMS_REPOSITORY_HUB");
    }, 75_000);
});
