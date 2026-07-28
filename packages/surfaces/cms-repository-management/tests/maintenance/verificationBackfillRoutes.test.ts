import { describe, expect, test } from "bun:test";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    IntegrationVerificationBackfillError,
    type IntegrationVerificationBackfiller,
    type IntegrationVerificationBackfillRequest,
} from "@bernouy/cms-integration-registry";
import {
    mountRepositoryVerificationBackfillRoutes,
    REPOSITORY_VERIFICATION_BACKFILL_PATH,
} from "@bernouy/cms-repository-management";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { verificationBackfillBody } from "./verificationBackfillSupport";

describe("repository verification backfill maintenance route", () => {
    test("accepts only canonical requests and preserves exact outcomes", async () => {
        const backfiller = new RecordingBackfiller();
        const runner = configuredRunner(backfiller);
        const body = await verificationBackfillBody();

        const imported = await runner.request(canonicalJsonBytes(body));
        backfiller.outcome = "unchanged";
        const unchanged = await runner.request(canonicalJsonBytes(body));

        expect(imported.status).toBe(201);
        expect(await imported.json()).toMatchObject({
            outcome: "backfilled",
            packageDigest: body.decision.packageDigest,
            verificationDigest: body.verification.digest,
        });
        expect(unchanged.status).toBe(200);
        expect(await unchanged.json()).toMatchObject({ outcome: "unchanged" });
        expect(backfiller.requests).toEqual([body, body]);
    });

    test("rejects non-canonical, oversized, malformed, duplicate, and substituted bodies", async () => {
        const backfiller = new RecordingBackfiller();
        const runner = configuredRunner(backfiller, 64_000);
        const body = await verificationBackfillBody();
        const canonical = new TextDecoder().decode(canonicalJsonBytes(body));
        const duplicate = new TextEncoder().encode(
            canonical.replace(
                '"schema":"cms.integration.verification-backfill-request.v1"',
                '"schema":"cms.integration.verification-backfill-request.v1","schema":"cms.integration.verification-backfill-request.v1"',
            ),
        );
        for (const [bytes, status, code] of [
            [new TextEncoder().encode(JSON.stringify(body, null, 2)), 400, "verification_backfill_invalid"],
            [new TextEncoder().encode("{"), 400, "verification_backfill_invalid"],
            [duplicate, 400, "verification_backfill_invalid"],
            [
                canonicalJsonBytes({ ...body, verification: { ...body.verification, digest: "f".repeat(64) } }),
                400,
                "verification_backfill_invalid",
            ],
            [new Uint8Array(64_001), 413, "verification_backfill_too_large"],
        ] as const) {
            const response = await runner.request(bytes);
            expect(response.status).toBe(status);
            expect(await response.json()).toMatchObject({ code });
        }
        expect(backfiller.requests).toEqual([]);
    });

    test("maps domain failures without exposing adapter details", async () => {
        const body = await verificationBackfillBody();
        for (const [status, code] of [
            [404, "verification_backfill_not_found"],
            [422, "verification_backfill_unapproved"],
            [409, "verification_backfill_conflict"],
            [409, "verification_backfill_partial"],
            [503, "verification_backfill_recovery_required"],
        ] as const) {
            const runner = configuredRunner(
                new RecordingBackfiller(new IntegrationVerificationBackfillError(status, code, "secret path")),
            );
            const response = await runner.request(canonicalJsonBytes(body));
            const text = await response.text();
            expect(response.status).toBe(status);
            expect(JSON.parse(text)).toMatchObject({ code });
            expect(text).not.toContain("secret");
        }
        const unexpected = await configuredRunner(new RecordingBackfiller(new Error("secret adapter path"))).request(
            canonicalJsonBytes(body),
        );
        const text = await unexpected.text();
        expect(unexpected.status).toBe(500);
        expect(JSON.parse(text)).toMatchObject({ code: "verification_backfill_failed" });
        expect(text).not.toContain("secret");
    });
});

class VerificationBackfillTestRunner {
    private handler?: RouteHandler;

    post(path: string, handler: RouteHandler): void {
        expect(path).toBe(REPOSITORY_VERIFICATION_BACKFILL_PATH);
        this.handler = handler;
    }

    async request(bytes: Uint8Array): Promise<Response> {
        if (!this.handler) {
            throw new Error("Verification backfill handler was not mounted");
        }
        return await this.handler(
            new Request(`http://localhost${REPOSITORY_VERIFICATION_BACKFILL_PATH}`, {
                method: "POST",
                headers: { "content-length": String(bytes.byteLength), "content-type": "application/json" },
                body: bytes,
            }),
        );
    }
}

class RecordingBackfiller implements IntegrationVerificationBackfiller {
    readonly requests: IntegrationVerificationBackfillRequest[] = [];
    outcome: "backfilled" | "unchanged" = "backfilled";

    constructor(private readonly failure?: Error) {}

    async backfill(request: IntegrationVerificationBackfillRequest) {
        this.requests.push(request);
        if (this.failure) {
            throw this.failure;
        }
        const target = request.verification.envelope.target;
        return {
            operationId: "backfill-1",
            outcome: this.outcome,
            ...target,
            verificationDigest: request.verification.digest,
            decisionRevisionId: request.decision.decisionId,
            decisionDigest: "f".repeat(64),
        } as const;
    }
}

function configuredRunner(backfiller: IntegrationVerificationBackfiller, maxBodyBytes = 40 * 1_024 * 1_024) {
    const runner = new VerificationBackfillTestRunner();
    mountRepositoryVerificationBackfillRoutes(runner as unknown as Runner, { backfiller, maxBodyBytes });
    return runner;
}
