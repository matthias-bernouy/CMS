import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    IntegrationVerificationBackfillRequest,
    PreparedOfficialVerificationBackfill,
} from "@bernouy/cms-integration-registry";
import { readBoundedJsonObjectResponse } from "cms-cli/http/readBoundedJsonObjectResponse";
import type { RepositoryMaintenanceClientConfig } from "../baselineImportClient";

const BACKFILL_PATH = "/api/integrations/verification-backfills";

export type MaintenanceVerificationBackfillResult =
    | Readonly<{
          outcome: "backfilled" | "unchanged";
          operationId: string;
          kind: string;
          version: string;
          packageDigest: string;
          verificationDigest: string;
          decisionRevisionId: string;
          decisionDigest: string;
      }>
    | Readonly<{
          outcome: "failed";
          reason: "invalid-response" | "rejected" | "timeout" | "transport" | "upstream";
          status?: number;
          code?: string;
          retryAfterSeconds?: number;
      }>;

export function officialVerificationBackfillRequest(
    entry: PreparedOfficialVerificationBackfill,
): IntegrationVerificationBackfillRequest {
    return {
        schema: "cms.integration.verification-backfill-request.v1",
        verification: { envelope: entry.verification.envelope, digest: entry.verification.digest },
        compatibilityReport: entry.compatibilityReport,
        verificationReport: entry.verificationReport,
        statefulChanges: entry.statefulChanges,
        decision: entry.decision,
    };
}

export async function backfillOfficialIntegrationVerification(
    config: RepositoryMaintenanceClientConfig,
    entry: PreparedOfficialVerificationBackfill,
): Promise<MaintenanceVerificationBackfillResult> {
    const request = officialVerificationBackfillRequest(entry);
    const decisionDigest = await sha256Hex(canonicalJsonBytes(entry.decision));
    const requestBytes = canonicalJsonBytes(request);
    const requestBody = new Uint8Array(requestBytes.byteLength);
    requestBody.set(requestBytes);
    const signal = AbortSignal.timeout(config.timeoutMs);
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(`${config.maintenanceUrl}${BACKFILL_PATH}`, {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
                authorization: `Bearer ${config.token}`,
                "content-length": String(requestBytes.byteLength),
                "content-type": "application/json",
            },
            body: requestBody.buffer,
        });
    } catch {
        return { outcome: "failed", reason: signal.aborted ? "timeout" : "transport" };
    }
    let body: Readonly<Record<string, unknown>>;
    try {
        body = await readBoundedJsonObjectResponse(response, "maintenance");
    } catch {
        return { outcome: "failed", reason: "invalid-response", status: response.status };
    }
    if (response.status === 200 || response.status === 201) {
        const expectedOutcome = response.status === 201 ? "backfilled" : "unchanged";
        const target = entry.verification.envelope.target;
        if (!isExactSuccess(body, expectedOutcome, target, entry, decisionDigest)) {
            return { outcome: "failed", reason: "invalid-response", status: response.status };
        }
        return {
            outcome: expectedOutcome,
            operationId: body.operationId as string,
            kind: target.kind,
            version: target.version,
            packageDigest: target.packageDigest,
            verificationDigest: entry.verification.digest,
            decisionRevisionId: entry.decision.decisionId,
            decisionDigest,
        };
    }
    return {
        outcome: "failed",
        reason: response.status === 404 || response.status === 409 || response.status === 422 ? "rejected" : "upstream",
        status: response.status,
        ...safeCode(body.code),
        ...retryAfter(response.headers.get("retry-after")),
    };
}

function isExactSuccess(
    body: Readonly<Record<string, unknown>>,
    outcome: "backfilled" | "unchanged",
    target: PreparedOfficialVerificationBackfill["verification"]["envelope"]["target"],
    entry: PreparedOfficialVerificationBackfill,
    decisionDigest: string,
): boolean {
    return (
        body.outcome === outcome &&
        typeof body.operationId === "string" &&
        body.operationId.length > 0 &&
        body.kind === target.kind &&
        body.version === target.version &&
        body.packageDigest === target.packageDigest &&
        body.verificationDigest === entry.verification.digest &&
        body.decisionRevisionId === entry.decision.decisionId &&
        body.decisionDigest === decisionDigest
    );
}

function safeCode(value: unknown): Readonly<{ code?: string }> {
    return typeof value === "string" && /^[a-z0-9_]{1,80}$/u.test(value) ? { code: value } : {};
}

function retryAfter(value: string | null): Readonly<{ retryAfterSeconds?: number }> {
    if (value === null || !/^[0-9]+$/u.test(value)) {
        return {};
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400 ? { retryAfterSeconds: seconds } : {};
}
