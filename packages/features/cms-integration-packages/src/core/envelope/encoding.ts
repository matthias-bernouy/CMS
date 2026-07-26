import type { IntegrationPackageFileV1 } from "../../interfaces/envelope";
import type { CanonicalFile } from "../../interfaces/fileSet";
import { IntegrationPackageValidationError } from "./errors";

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const utf8 = new TextEncoder();

export function assertCanonicalBase64(value: string, field = "content"): string {
    if (!CANONICAL_BASE64.test(value) || hasNonZeroPaddingBits(value)) {
        throw new IntegrationPackageValidationError(
            "invalid_base64",
            `${field} must use canonical padded base64`,
            field,
        );
    }
    return value;
}

function hasNonZeroPaddingBits(value: string): boolean {
    if (value.endsWith("==")) {
        return base64Value(value.charCodeAt(value.length - 3)) % 16 !== 0;
    }
    if (value.endsWith("=")) {
        return base64Value(value.charCodeAt(value.length - 2)) % 4 !== 0;
    }
    return false;
}

function base64Value(code: number): number {
    if (code >= 0x41 && code <= 0x5a) {
        return code - 0x41;
    }
    if (code >= 0x61 && code <= 0x7a) {
        return code - 0x61 + 26;
    }
    if (code >= 0x30 && code <= 0x39) {
        return code - 0x30 + 52;
    }
    return code === 0x2b ? 62 : 63;
}

export function decodedCanonicalFileByteLength(file: CanonicalFile): number {
    if (file.encoding === "utf8") {
        return utf8.encode(file.content).byteLength;
    }
    assertCanonicalBase64(file.content);
    const padding = file.content.endsWith("==") ? 2 : file.content.endsWith("=") ? 1 : 0;
    return (file.content.length / 4) * 3 - padding;
}

export function decodedIntegrationPackageFileByteLength(file: IntegrationPackageFileV1): number {
    return decodedCanonicalFileByteLength(file);
}

export function decodeCanonicalFile(file: CanonicalFile): Uint8Array {
    if (file.encoding === "utf8") {
        return utf8.encode(file.content);
    }
    assertCanonicalBase64(file.content);
    const binary = atob(file.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

export function decodeIntegrationPackageFile(file: IntegrationPackageFileV1): Uint8Array {
    return decodeCanonicalFile(file);
}
