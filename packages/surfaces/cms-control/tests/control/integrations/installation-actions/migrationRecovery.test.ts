import { describe, expect, test } from "bun:test";
import {
    ambiguousMigrationReconciliationRetryConfirmation,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import postAmbiguousMigrationReconciliationRetry from "cms-control/api/_platform/integrations/installations/retry-migration-reconciliation.post";
import { makeCms } from "../support/helpers";

const OPERATION_ID = "migration-operation-1";

describe("POST ambiguous integration migration reconciliation retry", () => {
    test("requires an authenticated administrator", async () => {
        const fixture = await controlFixture("user");

        await expect(postAmbiguousMigrationReconciliationRetry(request(), fixture.cms)).rejects.toMatchObject({
            status: 403,
        });
        expect((await fixture.installations.get("commerce"))?.migrationOperation?.journal.at(-1)?.status).toBe(
            "failed",
        );
    });

    test("records an audited CAS decision before allowing an explicit retry", async () => {
        const fixture = await controlFixture("admin");

        const response = await postAmbiguousMigrationReconciliationRetry(request(), fixture.cms);
        const body = (await response.json()) as {
            migrationOperation: {
                revision: number;
                journal: Array<{ phase: string; status: string }>;
                reconciliationResolutions: Array<{ actor: string; action: string; reason: string }>;
            };
        };

        expect(response.status).toBe(200);
        expect(body.migrationOperation.revision).toBe(8);
        expect(body.migrationOperation.journal.at(-1)).toMatchObject({
            phase: "reconcile-declarative",
            status: "pending",
        });
        expect(body.migrationOperation.reconciliationResolutions).toEqual([
            expect.objectContaining({
                actor: "subject-admin",
                action: "retry",
                reason: "Target state inspected and retry accepted.",
            }),
        ]);

        await expect(postAmbiguousMigrationReconciliationRetry(request(), fixture.cms)).rejects.toThrow(
            /state changed|does not have an ambiguous outcome/,
        );
    });
});

async function controlFixture(role: "admin" | "user") {
    const source: IntegrationDefinition = { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
    const target: IntegrationDefinition = { ...source, version: "1.1.0" };
    const fixture = makeCms([source, target]);
    const now = new Date("2026-07-28T10:00:00.000Z");
    await fixture.integrationInstallations.create({
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.1.0",
        definitionSnapshot: target,
        packageDigest: "d".repeat(64),
        status: "failed",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        migrationOperation: {
            id: OPERATION_ID,
            revision: 7,
            status: "paused",
            currentVersion: "1.0.0",
            currentPackageDigest: "c".repeat(64),
            targetVersion: "1.1.0",
            targetPackageDigest: "d".repeat(64),
            sourceDefinition: source,
            targetDefinition: target,
            connectors: [],
            attemptId: "replacement-attempt",
            fencingToken: 2,
            leaseExpiresAt: now,
            startedAt: now,
            updatedAt: now,
            pointOfNoReturnReachedAt: now,
            journal: [
                {
                    id: "reconcile-declarative",
                    phase: "reconcile-declarative",
                    targetDigest: "e".repeat(64),
                    idempotencyKey: "f".repeat(64),
                    status: "failed",
                    attemptId: "ambiguous-attempt",
                    startedAt: now,
                    error: { message: "receipt commit interrupted" },
                },
            ],
        },
    });
    Object.assign(fixture.cms, { auth: authentication(role) });
    return { cms: fixture.cms, installations: fixture.integrationInstallations };
}

function request(): Request {
    return new Request(
        "http://control.test/api/integrations/installations/retry-migration-reconciliation?id=commerce",
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                expectedOperationId: OPERATION_ID,
                expectedRevision: 7,
                reason: "Target state inspected and retry accepted.",
                confirmation: ambiguousMigrationReconciliationRetryConfirmation(OPERATION_ID),
            }),
        },
    );
}

function authentication(role: "admin" | "user") {
    return {
        loginUrl: "/login",
        logoutUrl: "/logout",
        profileUrl: "/profile",
        buildLoginUrl: () => "/login",
        buildLogoutUrl: () => "/logout",
        getSubject: async () => ({ identifier: `subject-${role}`, role }),
    };
}
