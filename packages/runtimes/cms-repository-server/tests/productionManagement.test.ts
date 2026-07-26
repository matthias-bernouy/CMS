import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepositoryManagementGuard } from "@bernouy/cms-repository-management";
import { BunRunner } from "@bernouy/http-runner";
import { InMemoryRateLimiter } from "@bernouy/rate-limiter";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { RepositoryCatalogRuntime } from "../src/core/catalogRuntime";
import { startRepositoryServer, type RepositoryServer } from "../src/core/repositoryServer";
import { createProductionRepositoryManagement } from "../src/management";

const roots: string[] = [];
const servers: RepositoryServer[] = [];

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
    for (const root of roots.splice(0)) {
        await makeWritable(root);
        await rm(root, { recursive: true, force: true });
    }
});

describe("production repository management", () => {
    test("publishes privately and exposes the new version through the shared public snapshot", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-repository-production-"));
        roots.push(root);
        const catalog = new RepositoryCatalogRuntime();
        const loadCatalog = () => buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect((await catalog.refresh(loadCatalog)).applied).toBe(true);
        const management = await createProductionRepositoryManagement({ root, catalog });
        const publicRunner = new BunRunner();
        const managementRunner = new BunRunner();
        const server = startRepositoryServer({
            publicRunner,
            managementRunner,
            publicPort: 0,
            managementPort: 0,
            catalog,
            loadCatalog,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
            integrationCompatibility: management.compatibility,
            managementGuard: createRepositoryManagementGuard({
                serviceToken: "management-secret",
                servicePrincipal: "management-cms",
                rateLimiter: new InMemoryRateLimiter({ limit: 10, windowSeconds: 60 }),
            }),
            mountManagement: management.mount,
        });
        servers.push(server);

        const managementOrigin = origin(managementRunner);
        const publicOrigin = origin(publicRunner);
        const unauthorized = await fetch(
            `${managementOrigin}/.cms/repository-management/api/integrations/publications`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: publicationDocument("1.0.0"),
            },
        );
        expect(unauthorized.status).toBe(401);

        for (const path of [
            "/api/integrations/publications",
            "/api/integrations/stable-promotions",
            "/api/integrations/compatibility/reevaluations",
        ]) {
            const rejectedMaintenanceCredential = await fetch(`${managementOrigin}/.cms/repository-management${path}`, {
                method: "POST",
                headers: {
                    authorization: "Bearer maintenance-secret",
                    "content-type": "application/json",
                },
                body: "{}",
            });
            expect(rejectedMaintenanceCredential.status).toBe(401);
        }

        const published = await fetch(`${managementOrigin}/.cms/repository-management/api/integrations/publications`, {
            method: "POST",
            headers: { authorization: "Bearer management-secret", "content-type": "application/json" },
            body: publicationDocument("1.0.0"),
        });
        expect(published.status).toBe(201);
        const publication = (await published.json()) as { digest: string };

        const duplicate = await fetch(`${managementOrigin}/.cms/repository-management/api/integrations/publications`, {
            method: "POST",
            headers: { authorization: "Bearer management-secret", "content-type": "application/json" },
            body: publicationDocument("1.0.0"),
        });
        expect(duplicate.status).toBe(409);
        expect(await duplicate.json()).toMatchObject({
            kind: "remote-demo",
            version: "1.0.0",
            existingDigest: publication.digest,
        });

        const status = await authenticatedFetch(`${managementOrigin}/.cms/repository-management/api/status`);
        expect(status.status).toBe(200);
        expect(await status.json()).toMatchObject({
            ready: true,
            health: "healthy",
            integrations: 1,
            versions: 1,
        });
        const versions = await authenticatedFetch(
            `${managementOrigin}/.cms/repository-management/api/integrations/versions?kind=remote-demo`,
        );
        expect(versions.status).toBe(200);
        expect(await versions.json()).toEqual({
            kind: "remote-demo",
            versions: [
                {
                    version: "1.0.0",
                    digest: publication.digest,
                    status: "unverified",
                    compatibility: {
                        admissionReportId: expect.any(String),
                        currentReportRevisionId: expect.any(String),
                        outcome: "not-applicable",
                        admissible: true,
                        warning: false,
                    },
                },
            ],
        });

        const secondPublication = await authenticatedJson(
            `${managementOrigin}/.cms/repository-management/api/integrations/publications`,
            publicationDocument("1.1.0"),
        );
        expect(secondPublication.status).toBe(201);
        const versionHistory = await authenticatedFetch(
            `${managementOrigin}/.cms/repository-management/api/integrations/versions?kind=remote-demo`,
        );
        const history = (await versionHistory.json()) as {
            stable?: string;
            latest?: string;
            versions: Array<{
                version: string;
                status?: string;
                compatibility: { currentReportRevisionId: string };
            }>;
        };
        expect(history.stable).toBeUndefined();
        expect(history.latest).toBeUndefined();
        expect(history.versions.map(({ version, status }) => ({ version, status }))).toEqual([
            { version: "1.0.0", status: "unverified" },
            { version: "1.1.0", status: "unverified" },
        ]);
        const admissionReportId = history.versions.find((item) => item.version === "1.1.0")?.compatibility
            .currentReportRevisionId;
        expect(admissionReportId).toBeString();
        if (!admissionReportId) {
            throw new Error("Published version did not expose its admission report");
        }
        const reevaluated = await authenticatedJson(
            `${managementOrigin}/.cms/repository-management/api/integrations/compatibility/reevaluations`,
            JSON.stringify({
                kind: "remote-demo",
                version: "1.1.0",
                currentReportRevisionId: admissionReportId,
                actor: "repository-owner",
                reason: "Evaluator rollout",
                evidenceIds: ["acceptance-evidence"],
            }),
        );
        expect(reevaluated.status).toBe(201);
        const reevaluation = (await reevaluated.json()) as {
            currentReportRevisionId: string;
            revision: { provenance: { actor: string; evidenceIds: string[] }; supersedes: string };
        };
        expect(reevaluation).toMatchObject({
            revision: {
                supersedes: admissionReportId,
                provenance: { actor: "repository-owner", evidenceIds: ["acceptance-evidence"] },
            },
        });
        const reportRevisionId = reevaluation.currentReportRevisionId;
        const publicCompatibility = await fetch(
            `${publicOrigin}/.cms/repository/api/integrations/compatibility?kind=remote-demo&version=1.1.0`,
        );
        expect(publicCompatibility.status).toBe(200);
        expect(publicCompatibility.headers.get("access-control-allow-origin")).toBe("*");
        const publicEtag = publicCompatibility.headers.get("etag");
        const publicHistoryText = await publicCompatibility.text();
        expect(publicHistoryText).not.toContain("repository-owner");
        expect(JSON.parse(publicHistoryText)).toMatchObject({
            current: { id: reportRevisionId },
            revisions: [{ id: reportRevisionId, provenance: { reason: "Evaluator rollout" } }],
        });
        const notModified = await fetch(
            `${publicOrigin}/.cms/repository/api/integrations/compatibility?kind=remote-demo&version=1.1.0`,
            { headers: { "if-none-match": publicEtag! } },
        );
        expect(notModified.status).toBe(304);
        const promoted = await authenticatedJson(
            `${managementOrigin}/.cms/repository-management/api/integrations/stable-promotions`,
            JSON.stringify({
                kind: "remote-demo",
                version: "1.1.0",
                currentReportRevisionId: reportRevisionId,
                actor: "repository-owner",
                confirmation: { version: "1.1.0", reportRevisionId },
                reason: "Production rollout",
            }),
        );
        expect(promoted.status).toBe(422);
        expect(await promoted.json()).toMatchObject({
            code: "integration_registry_stable_promotion_ineligible",
            reportRevisionId,
        });

        const integrations = await fetch(`${publicOrigin}/.cms/repository/api/integrations`);
        expect(integrations.status).toBe(200);
        expect(await integrations.json()).toEqual([
            expect.objectContaining({ kind: "remote-demo", versions: ["1.0.0", "1.1.0"] }),
        ]);
        expect(catalog.current().getIndex("remote-demo")?.stable).toBeUndefined();
        expect((await fetch(`${publicOrigin}/.cms/repository-management/api/integrations/publications`)).status).toBe(
            404,
        );
    });
});

function authenticatedFetch(url: string): Promise<Response> {
    return fetch(url, { headers: { authorization: "Bearer management-secret" } });
}

function authenticatedJson(url: string, body: string): Promise<Response> {
    return fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer management-secret", "content-type": "application/json" },
        body,
    });
}

function publicationDocument(version: string): string {
    return JSON.stringify({
        schema: "cms.integration.package.v1",
        kind: "remote-demo",
        version,
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Remote demo\n" },
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({ kind: "remote-demo", label: "Remote demo", version, inputs: [] }),
            },
        },
    });
}

function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("Test runner did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}

async function makeWritable(path: string): Promise<void> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) {
        return;
    }
    await chmod(path, 0o750);
    for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            await makeWritable(join(path, entry.name));
        }
    }
}
