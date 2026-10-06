import { describe, expect, test } from "bun:test";
import { DefaultCoreCapabilityDispatcher } from "@bernouy/cms-core";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { MAX_CAPABILITY_JSON_BYTES } from "@bernouy/cms-repository/contracts/protocol";
import type { ProviderManifestDigest } from "@bernouy/cms-repository/providers";
import { CmsCore } from "../src";

const token = "core-provider-token-that-is-long-enough";

describe("CmsCore", () => {
    test("authenticates the report and dispatches declared HTTP bindings", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultCoreCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async (input) => ({ id: input.id, value: input.value }));
        const runner = new BunRunner();
        new CmsCore(runner, {
            token,
            contracts: [contract.release],
            dispatcher,
            report: {
                protocol: "ulvia-provider/v1",
                providerId: "ulvia.official",
                account: { id: "local", label: "Local CMS Core" },
                buildVersion: "0.1.0",
                manifest: { version: "0.1.0", digest: digest("a") },
                implementations: [
                    {
                        contractId: contract.release.contractId,
                        version: contract.release.version,
                        digest: contract.digest,
                        status: "ready",
                    },
                ],
            },
        });
        const server = serveForTest(runner);
        try {
            expect((await server.request("GET", "/ulvia/report")).status).toBe(401);
            const report = await server.request("GET", "/ulvia/report", { headers: authorization() });
            expect(report.status).toBe(200);
            expect((await report.json()).providerId).toBe("ulvia.official");

            const response = await server.request("POST", `/v1/core/echo/${encodeURIComponent('"record-1"')}`, {
                headers: { ...authorization(), ...trustedHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ value: "hello" }),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ id: "record-1", value: "hello" });

            const oversized = await server.request("POST", `/v1/core/echo/${encodeURIComponent('"record-1"')}`, {
                headers: { ...authorization(), ...trustedHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ value: "x".repeat(MAX_CAPABILITY_JSON_BYTES + 1) }),
            });
            expect(oversized.status).toBe(413);
        } finally {
            server.stop();
        }
    });

    test("does not expose undeclared routes", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultCoreCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async (input) => input);
        const runner = new BunRunner();
        new CmsCore(runner, {
            token,
            contracts: [contract.release],
            dispatcher,
            report: {
                protocol: "ulvia-provider/v1",
                providerId: "ulvia.official",
                account: { id: "local", label: "Local CMS Core" },
                buildVersion: "0.1.0",
                manifest: { version: "0.1.0", digest: digest("a") },
                implementations: [
                    {
                        contractId: contract.release.contractId,
                        version: contract.release.version,
                        digest: contract.digest,
                        status: "ready",
                    },
                ],
            },
        });
        const server = serveForTest(runner);
        try {
            expect((await server.request("POST", "/v1/core/missing", { headers: authorization() })).status).toBe(404);
        } finally {
            server.stop();
        }
    });
});

function authorization(): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function trustedHeaders(): Record<string, string> {
    return {
        "x-ulvia-request-id": "00000000-0000-4000-8000-000000000001",
        "x-ulvia-site-id": "default",
        "x-ulvia-installation-id": "local-core",
        "x-ulvia-origin": "control",
        "x-ulvia-actor-kind": "administrator",
    };
}

async function contractRelease() {
    return admitContractReleaseJson(
        JSON.stringify({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "ulvia.cms.fixture",
            name: "Fixture",
            description: "CMS Core surface fixture.",
            version: "1.0.0",
            publisherId: "ulvia.official",
            capabilities: [
                {
                    id: "echo",
                    access: "admin",
                    behavior: { effect: "command", idempotency: "none", execution: "sync" },
                    input: {
                        type: "object",
                        properties: {
                            id: { type: "string", maxLength: 32 },
                            value: { type: "string", maxLength: 32 },
                        },
                        required: ["id", "value"],
                    },
                    output: {
                        type: "object",
                        properties: {
                            id: { type: "string", maxLength: 32 },
                            value: { type: "string", maxLength: 32 },
                        },
                        required: ["id", "value"],
                    },
                    errors: [],
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/core/echo/{id}",
                        input: { path: { id: "id" }, body: { properties: ["value"] } },
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                },
            ],
        }),
    );
}

function digest(character: string): ProviderManifestDigest {
    return `sha256:${character.repeat(64)}` as ProviderManifestDigest;
}
