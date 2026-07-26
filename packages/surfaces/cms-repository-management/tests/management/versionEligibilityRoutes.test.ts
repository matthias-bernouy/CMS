import { describe, expect, test } from "bun:test";
import {
    IntegrationRegistryVersionEligibilityStaleDecisionError,
    type IntegrationRegistryVersionBlockRequest,
    type IntegrationRegistryVersionEligibilityManager,
    type IntegrationRegistryVersionInadmissibleRequest,
} from "@bernouy/cms-integration-registry";
import {
    mountRepositoryVersionEligibilityRoutes,
    REPOSITORY_VERSION_BLOCKS_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

describe("repository version eligibility route", () => {
    test("delegates an exact confirmed block and returns the repaired channels", async () => {
        const manager = new RecordingEligibilityManager();
        const runner = configuredRunner(manager);
        const response = await runner.request(blockBody());

        expect(response.status).toBe(201);
        expect(manager.blocks).toEqual([blockBody()]);
        expect(await response.json()).toEqual({
            operationId: "operation-1",
            record: expect.objectContaining({
                action: "block",
                nextChannels: { stable: "1.0.0", latest: "1.0.0" },
            }),
        });
    });

    test("rejects missing, mismatched, and extra confirmation fields", async () => {
        const manager = new RecordingEligibilityManager();
        const runner = configuredRunner(manager);
        for (const body of [
            { ...blockBody(), confirmation: undefined },
            { ...blockBody(), confirmation: { ...blockBody().confirmation, decisionDigest: "b".repeat(64) } },
            { ...blockBody(), confirmation: { ...blockBody().confirmation, accepted: true } },
            { ...blockBody(), currentDecision: { ...blockBody().currentDecision, injected: true } },
            { ...blockBody(), injected: true },
        ]) {
            const response = await runner.request(body);
            expect(response.status).toBe(422);
        }
        expect(manager.blocks).toEqual([]);
    });

    test("maps stale decisions and redacts unexpected adapter failures", async () => {
        const stale = configuredRunner(
            new RecordingEligibilityManager(new IntegrationRegistryVersionEligibilityStaleDecisionError()),
        );
        const staleResponse = await stale.request(blockBody());
        expect(staleResponse.status).toBe(409);
        expect(await staleResponse.json()).toEqual({
            code: "integration_registry_version_eligibility_stale_decision",
            error: "Release decision is stale",
        });

        const failed = configuredRunner(new RecordingEligibilityManager(new Error("/private/registry/path")));
        const failedResponse = await failed.request(blockBody());
        expect(failedResponse.status).toBe(500);
        expect(await failedResponse.text()).not.toContain("/private/registry/path");
    });

    test("rejects oversized and malformed bodies before invoking the manager", async () => {
        const manager = new RecordingEligibilityManager();
        const runner = configuredRunner(manager, 128);
        expect((await runner.raw(JSON.stringify({ value: "x".repeat(256) }))).status).toBe(413);
        expect((await runner.raw("{")).status).toBe(400);
        expect(manager.blocks).toEqual([]);
    });
});

class EligibilityTestRunner {
    private handler?: RouteHandler;

    post(path: string, handler: RouteHandler): void {
        expect(path).toBe(REPOSITORY_VERSION_BLOCKS_PATH);
        this.handler = handler;
    }

    request(body: unknown): Promise<Response> {
        return this.raw(JSON.stringify(body));
    }

    async raw(body: string): Promise<Response> {
        if (!this.handler) {
            throw new Error("Version eligibility handler was not mounted");
        }
        return await this.handler(
            new Request(`http://localhost${REPOSITORY_VERSION_BLOCKS_PATH}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            }),
        );
    }
}

class RecordingEligibilityManager implements IntegrationRegistryVersionEligibilityManager {
    readonly blocks: IntegrationRegistryVersionBlockRequest[] = [];

    constructor(private readonly failure?: Error) {}

    async blockVersion(request: IntegrationRegistryVersionBlockRequest) {
        if (this.failure) {
            throw this.failure;
        }
        this.blocks.push(request);
        return {
            operationId: "operation-1",
            record: {
                schema: "cms.integration.registry.version-eligibility.v1" as const,
                id: "eligibility-1",
                operationId: "operation-1",
                action: "block" as const,
                kind: request.kind,
                version: request.version,
                packageDigest: "c".repeat(64),
                decision: request.currentDecision,
                nextStatus: "blocked" as const,
                previousChannels: { stable: request.version, latest: request.version },
                nextChannels: { stable: "1.0.0", latest: "1.0.0" },
                provenance: { actor: request.actor, reason: request.reason },
                confirmation: request.confirmation,
                createdAt: "2026-07-26T00:00:00.000Z",
            },
            snapshot: {} as never,
        };
    }

    async markVersionInadmissible(_request: IntegrationRegistryVersionInadmissibleRequest): Promise<never> {
        throw new Error("Unexpected inadmissible mutation");
    }
}

function configuredRunner(
    manager: IntegrationRegistryVersionEligibilityManager,
    maxBodyBytes = 65_536,
): EligibilityTestRunner {
    const runner = new EligibilityTestRunner();
    mountRepositoryVersionEligibilityRoutes(runner as unknown as Runner, { manager, maxBodyBytes });
    return runner;
}

function blockBody(): IntegrationRegistryVersionBlockRequest {
    return {
        kind: "commerce",
        version: "1.1.0",
        currentDecision: { revisionId: "decision-2", digest: "a".repeat(64) },
        actor: "repository-owner",
        reason: "Production incident",
        confirmation: {
            action: "block",
            kind: "commerce",
            version: "1.1.0",
            decisionRevisionId: "decision-2",
            decisionDigest: "a".repeat(64),
        },
    };
}
