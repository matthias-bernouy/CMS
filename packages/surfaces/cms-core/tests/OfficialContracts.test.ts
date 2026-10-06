import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CoreCapabilityDispatchError, DefaultCoreCapabilityDispatcher } from "@bernouy/cms-content";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { CmsCore } from "../src";

const TOKEN = "official-contract-matrix-token";
const ROUTES = [
    ["ulvia.cms.access", "overview", "/v1/cms/access"],
    ["ulvia.cms.collections", "list", "/v1/cms/collections/installed"],
    ["ulvia.cms.design", "overview", "/v1/cms/design"],
    ["ulvia.cms.files", "list", "/v1/cms/files"],
    ["ulvia.cms.operations", "status", "/v1/cms/operations/overview"],
    ["ulvia.cms.pages", "list", "/v1/cms/pages"],
    ["ulvia.cms.providers", "list", "/v1/cms/providers"],
] as const;

test("mounts and dispatches every official CMS contract release", async () => {
    const contracts = await Promise.all(ROUTES.map(([contractId]) => loadOfficialContract(contractId)));
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    for (const [contractId, capabilityId] of ROUTES) {
        dispatcher.register(contractId, capabilityId, async () => {
            throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        });
    }
    const runner = new BunRunner();
    new CmsCore(runner, {
        token: TOKEN,
        contracts: contracts.map(({ release }) => release),
        dispatcher,
        report: {
            protocol: "ulvia-provider/v1",
            providerId: "ulvia.official",
            account: { id: "contract-matrix", label: "Official contract matrix" },
            buildVersion: "0.1.0",
            manifest: { version: "0.1.0", digest: digest("a") },
            implementations: contracts.map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
                status: "ready",
            })),
        },
    });
    const server = serveForTest(runner);
    try {
        for (const [contractId, capabilityId, path] of ROUTES) {
            const response = await server.request("GET", path, { headers: requestHeaders() });
            expect(response.status, `${contractId}/${capabilityId}`).toBe(503);
            expect(await response.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
        }
    } finally {
        server.stop();
    }
});

async function loadOfficialContract(contractId: string) {
    const path = resolve(import.meta.dir, `../../../official-repository/contracts/${contractId}/definition.json`);
    return admitContractReleaseJson(await readFile(path));
}

function requestHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${TOKEN}`,
        "x-ulvia-request-id": "00000000-0000-4000-8000-000000000001",
        "x-ulvia-site-id": "default",
        "x-ulvia-installation-id": "local-core",
        "x-ulvia-origin": "control",
        "x-ulvia-actor-kind": "administrator",
    };
}

function digest(character: string): ProviderManifestDigest {
    return `sha256:${character.repeat(64)}` as ProviderManifestDigest;
}
