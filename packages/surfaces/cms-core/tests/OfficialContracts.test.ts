import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    CoreCapabilityDispatchError,
    CoreOperationExecutor,
    DefaultCoreCapabilityDispatcher,
    MemoryCoreOperationStore,
    registerOfficialCoreCapabilities,
    type CmsCoreDependencies,
} from "@bernouy/cms-core";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { CmsCore } from "../src";
import type { CmsFilesService } from "@bernouy/cms-files";

const TOKEN = "official-contract-matrix-token";
const ROUTES = [
    ["ulvia.cms.access", "overview", "POST", "/overview", {}],
    ["ulvia.cms.collections", "list", "POST", "/list", {}],
    ["ulvia.cms.files", "namespace.create", "POST", "/namespaces", { name: "Test", defaultVisibility: "private" }],
    ["ulvia.cms.jobs", "list", "POST", "/list", {}],
    ["ulvia.cms.localization", "overview", "POST", "/overview", {}],
    ["ulvia.cms.pages", "list", "POST", "/list", {}],
    ["ulvia.cms.providers", "list", "POST", "/list", {}],
    ["ulvia.cms.theme", "get", "POST", "/get", {}],
] as const;

test("mounts and dispatches every official CMS contract release", async () => {
    const contracts = await Promise.all(ROUTES.map(([contractId]) => loadOfficialContract(contractId)));
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    for (const { release } of contracts) {
        for (const capability of release.capabilities) {
            dispatcher.register(release.contractId, capability.id, async () => {
                throw new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            });
        }
    }
    expect(contracts.reduce((total, { release }) => total + release.capabilities.length, 0)).toBe(61);
    const runner = new BunRunner();
    new CmsCore(runner, {
        token: TOKEN,
        contracts: contracts.map(({ release }) => release),
        dispatcher,
        report: report(contracts),
    });
    const server = serveForTest(runner);
    try {
        for (const [contractId, capabilityId, method, path, body] of ROUTES) {
            const response = await server.request(method, path, {
                headers: {
                    ...requestHeaders(),
                    "x-ulvia-contract-id": contractId,
                    "content-type": "application/json",
                },
                body: JSON.stringify(body),
            });
            expect(response.status, `${contractId}/${capabilityId}`).toBe(503);
            expect(await response.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
        }
    } finally {
        server.stop();
    }
});

test("the official adapters implement the complete declared capability matrix", async () => {
    const contracts = await Promise.all(ROUTES.map(([contractId]) => loadOfficialContract(contractId)));
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const operations = new CoreOperationExecutor(new MemoryCoreOperationStore());
    registerOfficialCoreCapabilities(
        dispatcher,
        {} as CmsCoreDependencies,
        undefined,
        operations,
        undefined,
        undefined,
        {} as CmsFilesService,
    );

    expect(() => dispatcher.seal(contracts.map(({ release }) => release))).not.toThrow();
});

function report(contracts: Awaited<ReturnType<typeof loadOfficialContract>>[]) {
    return {
        protocol: "ulvia-provider/v1" as const,
        providerId: "ulvia.official",
        account: { id: "contract-matrix", label: "Official contract matrix" },
        buildVersion: "0.1.0",
        manifest: { version: "0.1.0", digest: digest("a") },
        implementations: contracts.map(({ release, digest }) => ({
            contractId: release.contractId,
            version: release.version,
            digest,
            status: "ready" as const,
        })),
    };
}

async function loadOfficialContract(contractId: string) {
    const path = resolve(
        import.meta.dir,
        `../../../runtimes/ulvia-cli/src/bootstrap/resources/contracts/cms/${contractId}/definition.json`,
    );
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
