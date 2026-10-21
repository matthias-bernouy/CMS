import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
    ProviderCapabilityDispatchError,
    ProviderOperationExecutor,
    DefaultProviderCapabilityDispatcher,
    MemoryProviderOperationStore,
    registerOfficialProviderCapabilities,
    type UlviaProviderDependencies,
    type CmsFileWorkspace,
} from "@bernouy/ulvia-provider";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { UlviaProvider } from "../src";
import type { CmsFilesService } from "@bernouy/cms-files";
import { NOOP_LOGGER } from "@bernouy/logging";

const TOKEN = "official-contract-matrix-token";
const ROUTES = [
    ["ulvia.cms.access", "list-users", "QUERY", "/list-users", {}],
    ["ulvia.cms.installations", "list-operations", "QUERY", "/operations", {}],
    ["ulvia.cms.content", "site.get", "GET", "/site", undefined],
    ["ulvia.cms.files", "namespace.create", "POST", "/namespaces", { name: "Test", defaultVisibility: "private" }],
    ["ulvia.cms.installations", "list-provider-installations", "GET", "/list-provider-installations", undefined],
] as const;

test("mounts and dispatches every official CMS contract release", async () => {
    const contracts = await Promise.all(
        [...new Set(ROUTES.map(([contractId]) => contractId))].map(loadOfficialContract),
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    for (const { release } of contracts) {
        for (const capability of release.capabilities) {
            dispatcher.register(release.contractId, capability.id, async () => {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            });
        }
    }
    expect(contracts.reduce((total, { release }) => total + release.capabilities.length, 0)).toBe(77);
    const runner = new BunRunner();
    const runtime = {
        siteId: "site-a",
        dispatcher,
        report: report(contracts),
        instance: {
            id: "instance:contract-matrix",
            status: "ready" as const,
            revision: 1,
            profile: { id: "ulvia.official", version: "1.0.0" },
        },
        contentRevision: async () => 1,
        kernel: {
            query: async () => null,
            handleCapability: async () => new Response(null, { status: 404 }),
            handleQuery: async () => new Response(null, { status: 404 }),
            handleCollectionAsset: async () => new Response(null, { status: 404 }),
            handleSitemap: async () => new Response(null, { status: 404 }),
        },
    };
    new UlviaProvider(runner, {
        contracts: contracts.map(({ release }) => release),
        logger: NOOP_LOGGER,
        authenticateControlToken: async (token) =>
            token === TOKEN ? { resource: runtime, release: () => undefined } : null,
        authenticateInvocationToken: async (token) => {
            try {
                const claims = verifyProviderInvocationToken(token, TOKEN);
                return claims.instanceId === runtime.report.instanceId
                    ? { lease: { resource: runtime, release: () => undefined }, claims }
                    : null;
            } catch {
                return null;
            }
        },
    });
    const server = serveForTest(runner);
    try {
        for (const [index, [contractId, capabilityId, method, path, body]] of ROUTES.entries()) {
            const requestId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
            const response = await server.request(method, path, {
                headers: {
                    ...requestHeaders(requestId, contractId, capabilityId),
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            expect(response.status, `${contractId}/${capabilityId}`).toBe(503);
            expect(await response.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
        }
    } finally {
        server.stop();
    }
});

test("the official adapters implement the complete declared capability matrix", async () => {
    const contracts = await Promise.all(
        [...new Set(ROUTES.map(([contractId]) => contractId))].map(loadOfficialContract),
    );
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const operations = new ProviderOperationExecutor(new MemoryProviderOperationStore());
    registerOfficialProviderCapabilities(
        dispatcher,
        {} as UlviaProviderDependencies,
        undefined,
        operations,
        undefined,
        undefined,
        {} as CmsFilesService,
        {} as CmsFileWorkspace,
    );

    expect(() => dispatcher.seal(contracts.map(({ release }) => release))).not.toThrow();
});

function report(contracts: Awaited<ReturnType<typeof loadOfficialContract>>[]) {
    return {
        protocol: "ulvia-provider/v1" as const,
        providerId: "ulvia.official",
        instanceId: "instance:contract-matrix",
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
        `../../../runtimes/ulvia-cli/dist/bootstrap/contracts/cms/${contractId}/definition.json`,
    );
    return admitContractReleaseJson(await readFile(path));
}

function requestHeaders(requestId: string, contractId: string, capabilityId: string): Record<string, string> {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const invocation = signProviderInvocationToken(TOKEN, {
        version: 1,
        requestId,
        instanceId: "instance:contract-matrix",
        contractId,
        contractVersion: "1.0.0",
        capabilityId,
        issuedAt,
        expiresAt: issuedAt + 30,
    });
    return {
        Authorization: `Bearer ${invocation}`,
        "x-ulvia-request-id": requestId,
    };
}

function digest(character: string): ProviderManifestDigest {
    return `sha256:${character.repeat(64)}` as ProviderManifestDigest;
}
