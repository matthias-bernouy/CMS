import {
    canonicalJsonBytes,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageLimits,
    IntegrationPackageValidationError,
    parseIntegrationPackageEnvelope,
    resolveIntegrationPackageLimits,
} from "@bernouy/cms-integration-packages";
import {
    IntegrationPackageUploadError,
    uploadInvalid,
    uploadTooLarge,
} from "cms-repository-management/packageUploadError";

const JSON_MEDIA_TYPE = "application/json";

export type IntegrationPackageUploadOptions = {
    maxBodyBytes: number;
    packageLimits?: Partial<IntegrationPackageLimits>;
};

export type IntegrationPackageUpload = {
    envelope: IntegrationPackageEnvelopeV1;
    canonicalBytes: Uint8Array;
    rawByteLength: number;
    canonicalByteLength: number;
};

export async function readIntegrationPackageUpload(
    request: Request,
    options: IntegrationPackageUploadOptions,
): Promise<IntegrationPackageUpload> {
    assertPositiveLimit(options.maxBodyBytes);
    const packageLimits = resolveIntegrationPackageLimits(options.packageLimits);
    assertSupportedRepresentation(request.headers);
    const declaredLength = parseContentLength(request.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength > options.maxBodyBytes) {
        throw uploadTooLarge();
    }

    const bytes = await readBoundedBody(request.body, options.maxBodyBytes);
    if (declaredLength !== undefined && declaredLength !== bytes.byteLength) {
        throw uploadInvalid();
    }

    try {
        const envelope = parseIntegrationPackageEnvelope(bytes, {
            limits: packageLimits,
            requireReleaseNotes: true,
        });
        const canonicalBytes = canonicalJsonBytes(envelope);
        return {
            envelope,
            canonicalBytes,
            rawByteLength: bytes.byteLength,
            canonicalByteLength: canonicalBytes.byteLength,
        };
    } catch (error) {
        if (error instanceof IntegrationPackageValidationError && error.code.endsWith("_limit_exceeded")) {
            throw uploadTooLarge();
        }
        throw uploadInvalid();
    }
}

function assertPositiveLimit(maxBodyBytes: number): void {
    if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
        throw new TypeError("Integration package upload maxBodyBytes must be a positive safe integer");
    }
}

function assertSupportedRepresentation(headers: Headers): void {
    const mediaType = headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const contentEncoding = headers.get("content-encoding")?.trim().toLowerCase();
    if (mediaType !== JSON_MEDIA_TYPE || (contentEncoding && contentEncoding !== "identity")) {
        throw uploadInvalid();
    }
}

function parseContentLength(value: string | null): number | undefined {
    if (value === null) {
        return undefined;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
        throw uploadInvalid();
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw uploadInvalid();
    }
    return parsed;
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
    if (!body) {
        throw uploadInvalid();
    }
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try {
        reader = body.getReader();
    } catch {
        throw uploadInvalid();
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array)) {
                throw uploadInvalid();
            }
            if (value.byteLength > maxBytes - totalBytes) {
                await reader.cancel().catch(() => undefined);
                throw uploadTooLarge();
            }
            chunks.push(value);
            totalBytes += value.byteLength;
        }
    } catch (error) {
        if (error instanceof IntegrationPackageUploadError) {
            throw error;
        }
        await reader.cancel().catch(() => undefined);
        throw uploadInvalid();
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}
