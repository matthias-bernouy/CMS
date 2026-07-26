import { afterEach, describe, expect, test } from "bun:test";
import type { ManagementCmsSurfaces } from "./cmsSurfaces";
import { startManagementCmsSurfaces } from "./cmsSurfaces";
import { candidateDocument } from "./publication";
import type { RepositoryProcess } from "./repositoryProcess";
import { startRepositoryProcess } from "./repositoryProcess";

let repository: RepositoryProcess | undefined;
let cms: ManagementCmsSurfaces | undefined;

afterEach(async () => {
    await cms?.stop();
    await repository?.dispose();
    cms = undefined;
    repository = undefined;
});

describe("management CMS process acceptance", () => {
    test("keeps public delivery anonymous while the exact CMS owner submits a private candidate", async () => {
        repository = await startRepositoryProcess();
        const privateBaseUrl = `${repository.managementOrigin}/.cms/repository-management`;
        const publicBaseUrl = `${repository.publicOrigin}/.cms/repository`;
        cms = await startManagementCmsSurfaces({
            publicRepositoryBaseUrl: publicBaseUrl,
            privateManagementBaseUrl: privateBaseUrl,
            token: repository.token,
        });

        const anonymousCatalog = await fetch(`${cms.deliveryOrigin}/.cms/repository/api/integrations`);
        expect(anonymousCatalog.status).toBe(200);
        const initialCatalog = (await anonymousCatalog.json()) as Array<{ kind: string; versions: string[] }>;
        expect(initialCatalog).toHaveLength(14);
        expect(initialCatalog).toContainEqual(expect.objectContaining({ kind: "commerce", versions: ["1.0.0"] }));
        expect(anonymousCatalog.headers.get("access-control-allow-origin")).toBe("*");
        expect((await fetch(`${cms.deliveryOrigin}/.cms/repository-management/api/status`)).status).toBe(404);
        expect((await fetch(`${repository.publicOrigin}/.cms/repository-management/api/status`)).status).toBe(404);
        expect((await fetch(`${repository.managementOrigin}/.cms/repository/api/integrations`)).status).toBe(404);

        const denied = await controlRequest(cms.controlOrigin, "/api/repository/status", "other-admin");
        expect(denied.status).toBe(403);
        expect(cms.upstreamRequests).toHaveLength(0);
        const anonymousControl = await fetch(`${cms.controlOrigin}/api/repository/status`, { redirect: "manual" });
        expect(anonymousControl.status).toBe(302);

        const candidate = await candidateDocument();
        const submitted = await controlRequest(cms.controlOrigin, "/api/repository/candidates", "owner", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: candidate,
        });
        expect(submitted.status).toBe(202);
        const submittedText = await submitted.text();
        const submittedCandidate = JSON.parse(submittedText).candidate as { candidateId: string; status: string };
        expect(submittedCandidate).toMatchObject({ status: "queued" });
        expect(cms.upstreamRequests).toHaveLength(1);
        expect(cms.upstreamRequests[0]).toMatchObject({
            method: "POST",
            authorization: `Bearer ${repository.token}`,
        });
        expect(cms.upstreamRequests[0]?.url).toBe(`${privateBaseUrl}/api/integrations/candidates`);

        const candidateStatus = await controlRequest(
            cms.controlOrigin,
            `/api/repository/candidates/status?candidateId=${encodeURIComponent(submittedCandidate.candidateId)}`,
            "owner",
        );
        expect(candidateStatus.status).toBe(200);
        const candidateStatusText = await candidateStatus.text();
        expect(JSON.parse(candidateStatusText)).toMatchObject({ candidate: { status: "queued" } });

        const status = await controlRequest(cms.controlOrigin, "/api/repository/status", "owner");
        expect(status.status).toBe(200);
        const statusText = await status.text();
        expect(JSON.parse(statusText)).toMatchObject({
            ready: true,
            health: "healthy",
            integrations: 14,
            versions: 14,
        });
        const adminPage = await controlRequest(cms.controlOrigin, "/admin/repository", "owner");
        expect(adminPage.status).toBe(200);
        const adminHtml = await adminPage.text();
        expect(adminHtml).toContain("Integration repository");

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
        expect(catalogHtml).not.toContain("Remote demo");
        assertBrowserBoundary(cms, repository, privateBaseUrl, [
            submittedText,
            candidateStatusText,
            statusText,
            adminHtml,
            packageText,
            catalogHtml,
        ]);

        await repository.stop();
        const unavailable = await controlRequest(cms.controlOrigin, "/api/repository/status", "owner");
        expect(unavailable.status).toBe(503);
        const unavailableText = await unavailable.text();
        expect(JSON.parse(unavailableText)).toEqual({
            code: "repository_management_unavailable",
            error: "Integration repository management is unavailable",
        });
        expect(unavailableText).not.toContain(repository.token);
        expect(unavailableText).not.toContain(privateBaseUrl);
        expect(unavailableText).not.toMatch(/ECONNREFUSED|fetch failed/iu);
        expect((await fetch(`${cms.deliveryOrigin}/integrations`)).status).toBe(503);
    }, 75_000);
});

function controlRequest(origin: string, path: string, session: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("cookie", `acceptance-session=${session}`);
    headers.set("origin", origin);
    return fetch(`${origin}${path}`, { ...init, headers, redirect: "manual" });
}

function assertBrowserBoundary(
    surfaces: ManagementCmsSurfaces,
    process: RepositoryProcess,
    privateBaseUrl: string,
    browserResponses: readonly string[],
): void {
    const browserTraffic = JSON.stringify(surfaces.browserRequests);
    expect(browserTraffic).not.toContain(process.token);
    expect(browserTraffic).not.toContain(privateBaseUrl);
    expect(surfaces.browserRequests.every((request) => request.authorization === null)).toBeTrue();
    for (const response of browserResponses) {
        expect(response).not.toContain(process.token);
        expect(response).not.toContain(privateBaseUrl);
    }
}
