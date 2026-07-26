import { expect } from "bun:test";
import type {
    IntegrationCompatibilityReevaluationRequest,
    IntegrationCompatibilityReevaluator,
} from "@bernouy/cms-integration-registry";
import {
    mountRepositoryCompatibilityReevaluationRoutes,
    REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";

export class ReevaluationTestRunner {
    private handler?: RouteHandler;

    post(path: string, handler: RouteHandler): void {
        expect(path).toBe(REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH);
        this.handler = handler;
    }

    request(body: unknown): Promise<Response> {
        return this.raw(JSON.stringify(body));
    }

    async raw(body: string): Promise<Response> {
        if (!this.handler) {
            throw new Error("Compatibility reevaluation handler was not mounted");
        }
        return await this.handler(
            new Request(`http://localhost${REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body,
            }),
        );
    }
}

export class RecordingReevaluator implements IntegrationCompatibilityReevaluator {
    readonly requests: IntegrationCompatibilityReevaluationRequest[] = [];

    constructor(private readonly failure?: Error) {}

    async reevaluate(request: IntegrationCompatibilityReevaluationRequest) {
        this.requests.push(request);
        if (this.failure) {
            throw this.failure;
        }
        const base = {
            kind: request.kind,
            version: request.version,
            packageDigest: "a".repeat(64),
            evaluator: { name: "test-evaluator", version: "2.0.0" },
            createdAt: "2026-07-26T12:00:00.000Z",
            baselines: [],
            informationalBaselines: [],
            evidence: [],
            outcome: "not-applicable" as const,
            requiredReleaseLevel: "none" as const,
            releaseLevel: "initial" as const,
            admissible: true,
            noBaselineReason: "new-kind" as const,
        };
        const admission = { ...base, id: "admission-1", reportType: "admission" as const };
        const revision = {
            ...base,
            id: "revision-2",
            reportType: "revision" as const,
            supersedes: request.currentReportRevisionId,
            provenance: {
                actor: request.actor,
                reason: request.reason,
                ...(request.evidenceIds ? { evidenceIds: request.evidenceIds } : {}),
            },
        };
        return { revision, history: { admission, current: revision, reports: [admission, revision] } };
    }
}

export function configuredRunner(
    reevaluator: IntegrationCompatibilityReevaluator,
    maxBodyBytes = 65_536,
): ReevaluationTestRunner {
    const runner = new ReevaluationTestRunner();
    mountRepositoryCompatibilityReevaluationRoutes(runner as unknown as Runner, { reevaluator, maxBodyBytes });
    return runner;
}

export function reevaluationBody(): IntegrationCompatibilityReevaluationRequest {
    return {
        kind: "commerce",
        version: "1.1.0",
        currentReportRevisionId: "report-2",
        actor: "repository-owner",
        reason: "Run evaluator version 2",
        evidenceIds: ["schema-ci-2"],
    };
}
