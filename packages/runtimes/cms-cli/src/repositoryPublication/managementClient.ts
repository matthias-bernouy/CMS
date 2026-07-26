import type { OfficialIntegrationPackage } from "./officialPackages";

const PUBLICATION_PATH = "/api/integrations/publications";
const MAX_RESPONSE_BYTES = 1_048_576;

export type ManagementPublicationResult =
    | Readonly<{ outcome: "published"; operationId: string }>
    | Readonly<{ outcome: "unchanged" }>
    | Readonly<{
          outcome: "failed";
          reason: "conflict" | "invalid-response" | "rejected" | "timeout" | "transport" | "upstream";
          status?: number;
          code?: string;
          retryAfterSeconds?: number;
      }>;

export type RepositoryManagementPublicationClientConfig = Readonly<{
    managementUrl: string;
    token: string;
    timeoutMs: number;
    fetch?: typeof fetch;
}>;

export async function publishOfficialIntegrationPackage(
    config: RepositoryManagementPublicationClientConfig,
    integrationPackage: OfficialIntegrationPackage,
): Promise<ManagementPublicationResult> {
    const signal = AbortSignal.timeout(config.timeoutMs);
    const requestBody = new Uint8Array(integrationPackage.canonicalBytes.byteLength);
    requestBody.set(integrationPackage.canonicalBytes);
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(`${config.managementUrl}${PUBLICATION_PATH}`, {
            method: "POST",
            redirect: "error",
            signal,
            headers: {
                authorization: `Bearer ${config.token}`,
                "content-length": String(integrationPackage.canonicalBytes.byteLength),
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
    if (response.status === 201) {
        return publicationSuccess(body, integrationPackage);
    }
    if (response.status === 409) {
        return publicationConflict(body, integrationPackage);
    }
    return publicationFailure(response, body);
}

function publicationSuccess(
    body: Readonly<Record<string, unknown>>,
    integrationPackage: OfficialIntegrationPackage,
): ManagementPublicationResult {
    if (
        body.kind !== integrationPackage.kind ||
        body.version !== integrationPackage.version ||
        body.digest !== integrationPackage.digest ||
        typeof body.operationId !== "string" ||
        !body.operationId
    ) {
        return { outcome: "failed", reason: "invalid-response", status: 201 };
    }
    return { outcome: "published", operationId: body.operationId };
}

function publicationConflict(
    body: Readonly<Record<string, unknown>>,
    integrationPackage: OfficialIntegrationPackage,
): ManagementPublicationResult {
    if (
        body.code === "integration_version_exists" &&
        body.kind === integrationPackage.kind &&
        body.version === integrationPackage.version &&
        body.existingDigest === integrationPackage.digest
    ) {
        return { outcome: "unchanged" };
    }
    return { outcome: "failed", reason: "conflict", status: 409, ...safeCode(body.code) };
}

function publicationFailure(response: Response, body: Readonly<Record<string, unknown>>): ManagementPublicationResult {
    const reason = response.status === 422 ? "rejected" : response.status >= 500 ? "upstream" : "upstream";
    return {
        outcome: "failed",
        reason,
        status: response.status,
        ...safeCode(body.code),
        ...retryAfter(response.headers.get("retry-after")),
    };
}

async function readBoundedJsonObject(response: Response): Promise<Readonly<Record<string, unknown>>> {
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType || (!contentType.startsWith("application/json;") && contentType !== "application/json")) {
        await response.body?.cancel();
        throw new Error("Repository management response must use application/json");
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new Error("Repository management response exceeds its byte limit");
    }
    if (!response.body) {
        throw new Error("Repository management response body is missing");
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
            throw new Error("Repository management response exceeds its byte limit");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Repository management response must be a JSON object");
    }
    return parsed as Readonly<Record<string, unknown>>;
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
