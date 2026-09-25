import { ProviderManifestValidationError } from "../errors";
import { expectArray, expectRecord, expectString, rejectUnknownKeys, unique } from "../values";
import type { ProviderEndpointPolicy } from "../../interfaces/ProviderManifest";

export function parseEndpointPolicy(value: unknown, path: string, maximum: number): ProviderEndpointPolicy {
    const record = expectRecord(value, path);
    rejectUnknownKeys(record, ["allowedOrigins", "defaultOrigin"], path);
    const allowedOrigins = expectArray(record.allowedOrigins, `${path}.allowedOrigins`, maximum).map((origin, index) =>
        parseOrigin(origin, `${path}.allowedOrigins[${index}]`),
    );
    if (allowedOrigins.length === 0) {
        throw new ProviderManifestValidationError("invalid_manifest", "must not be empty", `${path}.allowedOrigins`);
    }
    unique(allowedOrigins, `${path}.allowedOrigins`);
    const defaultOrigin =
        record.defaultOrigin === undefined ? undefined : parseOrigin(record.defaultOrigin, `${path}.defaultOrigin`);
    if (defaultOrigin && !allowedOrigins.includes(defaultOrigin)) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must be one of the allowed origins",
            `${path}.defaultOrigin`,
        );
    }
    return { allowedOrigins: allowedOrigins.sort(), ...(defaultOrigin ? { defaultOrigin } : {}) };
}

function parseOrigin(value: unknown, path: string): string {
    const origin = expectString(value, path, 2048);
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        throw new ProviderManifestValidationError("invalid_manifest", "must be an absolute origin", path);
    }
    if (url.origin !== origin || url.username || url.password || (url.protocol !== "https:" && !isLoopbackHttp(url))) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "must be a canonical HTTPS origin or loopback HTTP origin",
            path,
        );
    }
    return origin;
}

function isLoopbackHttp(url: URL): boolean {
    return url.protocol === "http:" && (url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname));
}
