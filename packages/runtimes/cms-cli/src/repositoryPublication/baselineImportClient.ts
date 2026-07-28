import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { OfficialRepositoryBootstrapEvidenceV1 } from "@bernouy/cms-official-integrations/publication";
import { readBoundedJsonObjectResponse } from "cms-cli/http/readBoundedJsonObjectResponse";

const IMPORT_PATH = "/api/integrations/schema-baselines";

type OfficialBaseline = OfficialRepositoryBootstrapEvidenceV1["reviewedSchemaBaselines"][number];

export type MaintenanceBaselineImportResult =
    | Readonly<{
          outcome: "imported" | "unchanged";
          operationId: string;
          baselineDigest: string;
          currentRevisionId: string;
      }>
    | Readonly<{
          outcome: "failed";
          reason: "invalid-response" | "rejected" | "timeout" | "transport" | "upstream";
          status?: number;
          code?: string;
          retryAfterSeconds?: number;
      }>;

export type RepositoryMaintenanceClientConfig = Readonly<{
    maintenanceUrl: string;
    token: string;
    timeoutMs: number;
    fetch?: typeof fetch;
}>;

export async function importOfficialReviewedSchemaBaseline(
    config: RepositoryMaintenanceClientConfig,
    baseline: OfficialBaseline,
): Promise<MaintenanceBaselineImportResult> {
    const baselineDigest = await sha256Hex(canonicalJsonBytes(baseline));
    const requestBytes = canonicalJsonBytes({
        schema: "cms.integration.reviewed-schema-baseline-import.v1",
        baselineDigest,
        baseline,
        expectedCurrent: null,
    });
    const requestBody = new Uint8Array(requestBytes.byteLength);
    requestBody.set(requestBytes);
    const signal = AbortSignal.timeout(config.timeoutMs);
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(`${config.maintenanceUrl}${IMPORT_PATH}`, {
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
        const expectedOutcome = response.status === 201 ? "imported" : "unchanged";
        if (
            body.outcome !== expectedOutcome ||
            body.kind !== baseline.kind ||
            body.version !== baseline.version ||
            body.packageDigest !== baseline.packageDigest ||
            body.baselineDigest !== baselineDigest ||
            typeof body.operationId !== "string" ||
            !body.operationId ||
            typeof body.currentRevisionId !== "string" ||
            !body.currentRevisionId
        ) {
            return { outcome: "failed", reason: "invalid-response", status: response.status };
        }
        return {
            outcome: expectedOutcome,
            operationId: body.operationId,
            baselineDigest,
            currentRevisionId: body.currentRevisionId,
        };
    }
    return {
        outcome: "failed",
        reason: response.status === 409 || response.status === 422 ? "rejected" : "upstream",
        status: response.status,
        ...safeCode(body.code),
        ...retryAfter(response.headers.get("retry-after")),
    };
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
