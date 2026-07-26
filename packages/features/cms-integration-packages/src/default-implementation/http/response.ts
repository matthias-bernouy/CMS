import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "../../core/httpContract";
import { IntegrationPackageRepositoryContractError } from "./errors";

export type IntegrationPackageResponseMetadata = {
    digest: string;
    contentLength?: number;
};

export function integrationPackageResponseMetadata(
    response: Response,
    maxDocumentBytes: number,
): IntegrationPackageResponseMetadata {
    const digest = response.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER);
    const contentLength = parseContentLength(response.headers.get("content-length"));
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!digest || !/^[a-f0-9]{64}$/.test(digest) || contentType !== "application/json") {
        throw new IntegrationPackageRepositoryContractError();
    }
    if (contentLength !== undefined && contentLength > maxDocumentBytes) {
        throw new IntegrationPackageRepositoryContractError();
    }
    return { digest, ...(contentLength !== undefined ? { contentLength } : {}) };
}

export async function readIntegrationPackageResponse(
    response: Response,
    maxDocumentBytes: number,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new IntegrationPackageRepositoryContractError();
    }
    const cancel = () => {
        void reader.cancel().catch(() => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        signal.throwIfAborted();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (value.byteLength > maxDocumentBytes - totalBytes) {
                cancel();
                throw new IntegrationPackageRepositoryContractError();
            }
            chunks.push(value);
            totalBytes += value.byteLength;
        }
    } finally {
        signal.removeEventListener("abort", cancel);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export function assertMatchingPackageMetadata(
    head: IntegrationPackageResponseMetadata,
    get: IntegrationPackageResponseMetadata,
): void {
    if (
        head.digest !== get.digest ||
        (head.contentLength !== undefined &&
            get.contentLength !== undefined &&
            head.contentLength !== get.contentLength)
    ) {
        throw new IntegrationPackageRepositoryContractError();
    }
}

function parseContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
        throw new IntegrationPackageRepositoryContractError();
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new IntegrationPackageRepositoryContractError();
    }
    return parsed;
}
