import { describe, expect, test } from "bun:test";
import { executeRepositoryOperator } from "../../../src/repositoryPublication/candidate/operator/client";
import { client, compatibility, json, KIND, release, scriptedFetch, VERSION, versions } from "./operatorSupport";

describe("repository operator response integrity", () => {
    test("rejects an operation record that does not match its outer reference", async () => {
        const capture = scriptedFetch([
            json(200, release()),
            json(201, {
                operationId: "promotion-1",
                record: { operationId: "promotion-other", kind: KIND, version: VERSION },
            }),
        ]);

        expect(await executeRepositoryOperator(client(capture.fetch), promotion())).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 201,
        });
    });

    test("rejects a reevaluation whose current report does not identify the returned revision", async () => {
        const capture = scriptedFetch([
            json(200, compatibility()),
            json(200, release()),
            json(201, {
                revision: { kind: KIND, version: VERSION, reportId: "report-2" },
                currentReport: { revisionId: "report-other", reportDigest: "c".repeat(64) },
            }),
        ]);

        expect(await executeRepositoryOperator(client(capture.fetch), reevaluation())).toEqual({
            outcome: "failed",
            reason: "invalid-response",
            status: 201,
        });
    });

    test("rejects terminal controls in references and non-version channel values", async () => {
        const unsafeReference = `promotion-${String.fromCodePoint(0x9b)}31m`;
        const promotionCapture = scriptedFetch([
            json(200, release()),
            json(201, {
                operationId: unsafeReference,
                record: { operationId: unsafeReference, kind: KIND, version: VERSION },
            }),
        ]);
        expect(await executeRepositoryOperator(client(promotionCapture.fetch), promotion())).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });

        const blockCapture = scriptedFetch([
            json(200, versions()),
            json(201, {
                operationId: "block-1",
                record: {
                    operationId: "block-1",
                    action: "block",
                    kind: KIND,
                    version: VERSION,
                    previousChannels: { stable: VERSION, latest: VERSION },
                    nextChannels: { stable: "1.1.0", latest: `1.1.0${String.fromCodePoint(0x202e)}` },
                },
            }),
        ]);
        expect(await executeRepositoryOperator(client(blockCapture.fetch), block())).toMatchObject({
            outcome: "failed",
            reason: "invalid-response",
        });
    });
});

function promotion() {
    return { type: "promote-stable" as const, kind: KIND, version: VERSION };
}

function reevaluation() {
    return {
        type: "reevaluate" as const,
        kind: KIND,
        version: VERSION,
        reason: "Comparator update",
    };
}

function block() {
    return { type: "block" as const, kind: KIND, version: VERSION, reason: "Security regression" };
}
