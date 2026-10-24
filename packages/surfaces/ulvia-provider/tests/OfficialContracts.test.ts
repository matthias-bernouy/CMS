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
import { CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { NOOP_LOGGER } from "@bernouy/logging";
import { ConfiguredSmtpEmailer } from "@bernouy/cms-smtp-emailer/nodemailer";

const TOKEN = "official-contract-matrix-token";
const ROUTES = [
    ["ulvia.cms.access", "list-users", "QUERY", "/list-users", {}],
    ["ulvia.cms.installations", "list-operations", "QUERY", "/operations", {}],
    ["ulvia.cms.content", "site.get", "GET", "/site", undefined],
    ["ulvia.cms.emailer.smtp", "smtp.configuration.get", "GET", "/configuration", undefined],
    ["ulvia.cms.files", "namespace.create", "POST", "/namespaces", { name: "Test", defaultVisibility: "private" }],
    ["ulvia.cms.secrets", "namespace.create", "POST", "/namespaces", { name: "Test" }],
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
    expect(contracts.every(({ release }) => release.capabilities.length > 0)).toBe(true);
    const runner = new BunRunner();
    const runtime = {
        siteId: "site-a",
        dispatcher,
        report: report(contracts),
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
            const contractVersion = contracts.find(({ release }) => release.contractId === contractId)?.release.version;
            if (!contractVersion) {
                throw new Error(`Official contract is unavailable: ${contractId}`);
            }
            const response = await server.request(method, path, {
                headers: {
                    ...requestHeaders(requestId, contractId, contractVersion, capabilityId),
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            expect(response.status, `${contractId}/${capabilityId}`).toBe(503);
            expect(await response.json()).toEqual({ error: { code: "CORE_UNAVAILABLE" } });
        }
        const controlResponse = await server.request("GET", "/list-provider-installations", {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "x-ulvia-request-id": "00000000-0000-4000-8000-000000000099",
                "x-ulvia-contract-id": "ulvia.cms.installations",
                "x-ulvia-contract-version": "1.0.0",
                "x-ulvia-capability-id": "list-provider-installations",
            },
        });
        expect(controlResponse.status).toBe(503);
        expect(
            (
                await server.request("POST", "/namespaces", {
                    headers: {
                        Authorization: `Bearer ${TOKEN}`,
                        "content-type": "application/json",
                        "x-ulvia-request-id": "00000000-0000-4000-8000-000000000100",
                        "x-ulvia-contract-id": "ulvia.cms.secrets",
                        "x-ulvia-contract-version": "1.0.0",
                        "x-ulvia-capability-id": "namespace.create",
                    },
                    body: '{"name":"Forbidden"}',
                })
            ).status,
        ).toBe(401);
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
    const secrets = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore());
    const emailer = new ConfiguredSmtpEmailer({ secrets: new InMemorySecretStore() });
    registerOfficialProviderCapabilities(
        dispatcher,
        { ...({} as UlviaProviderDependencies), emailer, secrets },
        undefined,
        operations,
        undefined,
        undefined,
        {} as CmsFilesService,
        {} as CmsFileWorkspace,
        new Set(contracts.map(({ release }) => release.contractId)),
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
    const admission = await admitContractReleaseJson(await readFile(path));
    const inherited = [];
    let parent = admission.release.extends;
    while (parent) {
        const parentPath = resolve(
            import.meta.dir,
            `../../../runtimes/ulvia-cli/dist/bootstrap/contracts/cms/${parent.contractId}/definition.json`,
        );
        const parentAdmission = await admitContractReleaseJson(await readFile(parentPath));
        if (parentAdmission.release.version !== parent.version || parentAdmission.digest !== parent.digest) {
            throw new Error(`Official parent contract mismatch: ${parent.contractId}@${parent.version}`);
        }
        inherited.unshift(...parentAdmission.release.capabilities);
        parent = parentAdmission.release.extends;
    }
    return {
        ...admission,
        release: Object.freeze({
            ...admission.release,
            capabilities: Object.freeze([...inherited, ...admission.release.capabilities]),
        }),
    };
}

function requestHeaders(
    requestId: string,
    contractId: string,
    contractVersion: string,
    capabilityId: string,
): Record<string, string> {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const invocation = signProviderInvocationToken(TOKEN, {
        version: 1,
        requestId,
        instanceId: "instance:contract-matrix",
        contractId,
        contractVersion,
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
