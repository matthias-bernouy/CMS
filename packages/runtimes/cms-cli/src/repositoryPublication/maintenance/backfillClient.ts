import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    IntegrationVerificationBackfillRequest,
    PreparedOfficialVerificationBackfill,
} from "@bernouy/cms-integration-registry";
import type { RepositoryMaintenanceClientConfig } from "../baselineImportClient";

const BACKFILL_PATH = "/api/integrations/verification-backfills";
const MAX_RESPONSE_BYTES = 1_048_576;

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
        body = await readBoundedJsonObject(response);
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

async function readBoundedJsonObject(response: Response): Promise<Readonly<Record<string, unknown>>> {
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType || (!contentType.startsWith("application/json;") && contentType !== "application/json")) {
        await response.body?.cancel();
        throw new Error("Repository maintenance response must use application/json");
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new Error("Repository maintenance response exceeds its byte limit");
    }
    if (!response.body) {
        throw new Error("Repository maintenance response body is missing");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error("Repository maintenance response exceeds its byte limit");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Repository maintenance response must be a JSON object");
    }
    return value as Readonly<Record<string, unknown>>;
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
