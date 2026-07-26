import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { OfficialRepositoryBootstrapEvidenceV1 } from "@bernouy/cms-official-integrations/publication";

const IMPORT_PATH = "/api/integrations/schema-baselines";
const MAX_RESPONSE_BYTES = 1_048_576;

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
        body = await readBoundedJsonObject(response);
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
    const bytes = await readBoundedResponseBytes(response);
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Repository maintenance response must be a JSON object");
    }
    return value as Readonly<Record<string, unknown>>;
}

async function readBoundedResponseBytes(response: Response): Promise<Uint8Array> {
    if (!response.body) {
        throw new Error("Repository maintenance response body is missing");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
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
    return bytes;
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
