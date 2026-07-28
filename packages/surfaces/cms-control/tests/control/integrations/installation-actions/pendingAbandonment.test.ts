import { describe, expect, test } from "bun:test";
import {
    legacyPendingIntegrationOperationAbandonmentConfirmation,
    pendingIntegrationOperationAbandonmentConfirmation,
    type IntegrationDefinition,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import postPendingIntegrationOperationAbandonment from "cms-control/api/_platform/integrations/installations/abandon-pending-operation.post";
import { makeCms } from "../support/helpers";

const OPERATION_ID = "ordinary-operation-1";

describe("POST pending integration operation abandonment", () => {
    test("restores only the durable source document, requires external reconciliation, and fences the writer", async () => {
        const fixture = await recoveryFixture();
        const abandoned = await fixture.integrationInstallations.get("commerce");
        if (!abandoned) {
            throw new Error("missing pending installation fixture");
        }

        const response = await postPendingIntegrationOperationAbandonment(request(abandoned), fixture.cms);
        const recovered = (await response.json()) as IntegrationInstallation;

        expect(response.status).toBe(200);
        expect(recovered).toMatchObject({
            status: "failed",
            definitionVersion: "1.0.0",
            packageDigest: "a".repeat(64),
            answersSnapshot: { region: "source" },
            secretRefs: { token: "SOURCE_TOKEN" },
            artifacts: [{ type: "source", id: "urn:source", action: "created" }],
            pendingOperationAbandonments: [
                expect.objectContaining({
                    operationId: OPERATION_ID,
                    actor: "subject-admin",
                    reason: "The owning CMS process was confirmed stopped.",
                    externalReconciliationRequired: true,
                }),
            ],
        });
        expect(recovered.pendingOperation).toBeUndefined();
        expect(recovered.definitionSnapshot?.version).toBe("1.0.0");
        expect(await fixture.secrets.get("SOURCE_TOKEN")).toBe("source-secret");
        expect(
            await fixture.integrationInstallations.compareAndSwapMigration!(abandoned, {
                ...abandoned,
                status: "success",
            }),
        ).toBeNull();
    });

    test("requires an authenticated administrator", async () => {
        const fixture = await recoveryFixture("user");
        const pending = await fixture.integrationInstallations.get("commerce");
        if (!pending) {
            throw new Error("missing pending installation fixture");
        }

        await expect(postPendingIntegrationOperationAbandonment(request(pending), fixture.cms)).rejects.toMatchObject({
            status: 403,
        });
    });

    test("abandons a legacy markerless pending document only through the timestamp-bound confirmation", async () => {
        const fixture = await recoveryFixture();
        const pending = await fixture.integrationInstallations.get("commerce");
        if (!pending) {
            throw new Error("missing pending installation fixture");
        }
        const markerless = await fixture.integrationInstallations.replace({
            ...pending.pendingOperation!.sourceState,
            id: pending.id,
            label: pending.label,
            status: "pending",
            pendingOperation: undefined,
            pendingOperationAbandonments: pending.pendingOperationAbandonments,
            migrationOperation: pending.migrationOperation,
            connectorBaselineAdoptions: pending.connectorBaselineAdoptions,
            createdAt: pending.createdAt,
            updatedAt: pending.updatedAt,
        });

        const response = await postPendingIntegrationOperationAbandonment(legacyRequest(markerless), fixture.cms);
        const abandoned = (await response.json()) as IntegrationInstallation;

        expect(abandoned).toMatchObject({
            status: "failed",
            definitionVersion: "1.0.0",
            pendingOperationAbandonments: [
                expect.objectContaining({ legacyMarkerless: true, externalReconciliationRequired: true }),
            ],
        });
    });
});

async function recoveryFixture(role: "admin" | "user" = "admin") {
    const source: IntegrationDefinition = { kind: "commerce", label: "Commerce", version: "1.0.0", inputs: [] };
    const target: IntegrationDefinition = { ...source, version: "1.1.0" };
    const fixture = makeCms([source, target]);
    await fixture.secrets.set("SOURCE_TOKEN", "source-secret");
    const created = await fixture.integrationInstallations.create({
        id: "commerce",
        label: "Commerce",
        definitionVersion: "1.0.0",
        definitionSnapshot: source,
        packageDigest: "a".repeat(64),
        status: "success",
        answersSnapshot: { region: "source" },
        secretRefs: { token: "SOURCE_TOKEN" },
        secretInputs: ["token"],
        artifacts: [{ type: "source", id: "urn:source", action: "created" }],
    });
    const pendingOperation = {
        id: OPERATION_ID,
        startedAt: new Date("2026-07-28T08:00:00.000Z"),
        sourceState: {
            status: created.status,
            definitionVersion: created.definitionVersion,
            definitionSnapshot: source,
            packageDigest: created.packageDigest,
            answersSnapshot: created.answersSnapshot,
            secretRefs: created.secretRefs,
            secretInputs: created.secretInputs,
            artifacts: created.artifacts,
            runCount: created.runCount,
            runs: created.runs,
        },
    };
    await fixture.integrationInstallations.replace({
        ...created,
        status: "pending",
        definitionVersion: "1.1.0",
        definitionSnapshot: target,
        packageDigest: "b".repeat(64),
        answersSnapshot: { region: "target" },
        secretRefs: { token: "TARGET_TOKEN" },
        artifacts: [{ type: "source", id: "urn:target", action: "created" }],
        pendingOperation,
        updatedAt: new Date("2026-07-28T08:01:00.000Z"),
    });
    Object.assign(fixture.cms, { auth: authentication(role) });
    return fixture;
}

function request(installation: IntegrationInstallation): Request {
    return new Request("http://control.test/api/integrations/installations/abandon-pending-operation?id=commerce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            expectedOperationId: OPERATION_ID,
            expectedUpdatedAt: installation.updatedAt.toISOString(),
            reason: "The owning CMS process was confirmed stopped.",
            confirmation: pendingIntegrationOperationAbandonmentConfirmation(OPERATION_ID),
        }),
    });
}

function legacyRequest(installation: IntegrationInstallation): Request {
    return new Request("http://control.test/api/integrations/installations/abandon-pending-operation?id=commerce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            expectedUpdatedAt: installation.updatedAt.toISOString(),
            reason: "The legacy CMS process was confirmed stopped.",
            confirmation: legacyPendingIntegrationOperationAbandonmentConfirmation(
                installation.id,
                installation.updatedAt,
            ),
        }),
    });
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
