import { describe, expect, test } from "bun:test";
import {
    IntegrationRegistryStablePromotionIneligibleError,
    IntegrationRegistryStablePromotionStaleReportError,
    type IntegrationRegistryStablePromoter,
    type IntegrationRegistryStablePromotionRequest,
} from "@bernouy/cms-integration-registry";
import {
    mountRepositoryStablePromotionRoutes,
    REPOSITORY_STABLE_PROMOTIONS_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

describe("repository stable promotion route", () => {
    test("delegates an explicitly confirmed promotion and returns its audit record", async () => {
        const promoter = new RecordingPromoter();
        const runner = configuredRunner(promoter);
        const response = await runner.request(promotionBody());

        expect(response.status).toBe(201);
        expect(promoter.requests).toEqual([promotionBody()]);
        expect(await response.json()).toEqual({
            operationId: "operation-1",
            record: expect.objectContaining({
                id: "promotion-1",
                actor: "repository-owner",
                reportRevisionId: "report-2",
            }),
        });
    });

    test("rejects missing, mismatched, and extra confirmation fields", async () => {
        const promoter = new RecordingPromoter();
        const runner = configuredRunner(promoter);
        for (const body of [
            { ...promotionBody(), confirmation: undefined },
            { ...promotionBody(), confirmation: { version: "1.0.0", reportRevisionId: "report-1" } },
            {
                ...promotionBody(),
                confirmation: { version: "1.1.0", reportRevisionId: "report-2", accepted: true },
            },
            { ...promotionBody(), injected: true },
        ]) {
            const response = await runner.request(body);
            expect(response.status).toBe(422);
        }
        expect(promoter.requests).toEqual([]);
    });

    test("maps stale and ineligible revisions without leaking adapter failures", async () => {
        const stale = configuredRunner(
            new RecordingPromoter(new IntegrationRegistryStablePromotionStaleReportError("report-1", "report-2")),
        );
        const staleResponse = await stale.request(promotionBody());
        expect(staleResponse.status).toBe(409);
        expect(await staleResponse.json()).toEqual({
            code: "integration_registry_stable_promotion_stale_report",
            error: "Release admission decision is stale",
            currentReportRevisionId: "report-2",
        });

        const ineligible = configuredRunner(
            new RecordingPromoter(
                new IntegrationRegistryStablePromotionIneligibleError(
                    "commerce",
                    "1.1.0",
                    "report-2",
                    "private evaluator detail",
                ),
            ),
        );
        const ineligibleResponse = await ineligible.request(promotionBody());
        expect(ineligibleResponse.status).toBe(422);
        expect(await ineligibleResponse.text()).not.toContain("private evaluator detail");

        const failed = configuredRunner(new RecordingPromoter(new Error("/private/registry/path")));
        const failedResponse = await failed.request(promotionBody());
        expect(failedResponse.status).toBe(500);
        expect(await failedResponse.text()).not.toContain("/private/registry/path");
    });

    test("rejects oversized and malformed bodies before invoking the promoter", async () => {
        const promoter = new RecordingPromoter();
        const runner = configuredRunner(promoter, 128);
        const oversized = await runner.raw(JSON.stringify({ value: "x".repeat(256) }));
        expect(oversized.status).toBe(413);
        const malformed = await runner.raw("{");
        expect(malformed.status).toBe(400);
        expect(promoter.requests).toEqual([]);
    });
});

class PromotionTestRunner {
    private handler?: RouteHandler;

    post(path: string, handler: RouteHandler): void {
        expect(path).toBe(REPOSITORY_STABLE_PROMOTIONS_PATH);
        this.handler = handler;
    }

    request(body: unknown): Promise<Response> {
        return this.raw(JSON.stringify(body));
    }

    async raw(body: string): Promise<Response> {
        if (!this.handler) {
            throw new Error("Stable promotion handler was not mounted");
        }
        return await this.handler(
            new Request(`http://localhost${REPOSITORY_STABLE_PROMOTIONS_PATH}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            }),
        );
    }
}

class RecordingPromoter implements IntegrationRegistryStablePromoter {
    readonly requests: IntegrationRegistryStablePromotionRequest[] = [];

    constructor(private readonly failure?: Error) {}

    async promoteStable(request: IntegrationRegistryStablePromotionRequest) {
        if (this.failure) {
            throw this.failure;
        }
        this.requests.push(request);
        return {
            operationId: "operation-1",
            record: {
                schema: "cms.integration.registry.stable-promotion.v2" as const,
                id: "promotion-1",
                operationId: "operation-1",
                kind: request.kind,
                version: request.version,
                packageDigest: "a".repeat(64),
                reportRevisionId: request.currentReportRevisionId,
                reportDigest: "b".repeat(64),
                reportType: "release-admission-decision" as const,
                previousStable: "1.0.0",
                actor: request.actor,
                confirmation: request.confirmation,
                createdAt: "2026-07-26T00:00:00.000Z",
            },
            snapshot: {} as never,
        };
    }
}

function configuredRunner(promoter: IntegrationRegistryStablePromoter, maxBodyBytes = 65_536): PromotionTestRunner {
    const runner = new PromotionTestRunner();
    mountRepositoryStablePromotionRoutes(runner as unknown as Runner, { promoter, maxBodyBytes });
    return runner;
}

function promotionBody(): IntegrationRegistryStablePromotionRequest {
    return {
        kind: "commerce",
        version: "1.1.0",
        currentReportRevisionId: "report-2",
        actor: "repository-owner",
        confirmation: { version: "1.1.0", reportRevisionId: "report-2" },
        reason: "Validated rollout",
    };
}
