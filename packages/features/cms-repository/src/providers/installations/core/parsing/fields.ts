import { isReleaseDigest } from "cms-repository/exports/contracts/index";
import { ProviderManifestValidationError } from "cms-repository/providers/manifests/core/errors";
import { expectString } from "cms-repository/providers/manifests/core/values";
import { parseEndpointPolicy } from "cms-repository/providers/manifests/core/parsing/parseEndpoint";
import { ProviderInstallationValidationError } from "../errors";

export function parseOpaqueId(value: unknown, path: string): string {
    const id = expectString(value, path, 128);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) {
        throw new ProviderInstallationValidationError("invalid_installation", "must be an opaque identifier", path);
    }
    return id;
}

export function parseDigest(value: unknown, path: string): string {
    const digest = expectString(value, path, 71);
    if (!isReleaseDigest(digest)) {
        throw new ProviderInstallationValidationError("invalid_installation", "must be a SHA-256 digest", path);
    }
    return digest;
}

/** Syntax only. The future HTTP adapter must enforce destination and redirect policy. */
export function parseEndpoint(value: unknown, path: string): string {
    try {
        return parseEndpointPolicy({ allowedOrigins: [value] }, path, 1).allowedOrigins[0]!;
    } catch (error) {
        if (!(error instanceof ProviderManifestValidationError)) {
            throw error;
        }
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "must be a canonical HTTPS origin or loopback HTTP origin",
            path,
        );
    }
}

/** Exact cms-secrets reference syntax; never an inline credential or template expression. */
export function parseSecretRef(value: unknown, path: string): string {
    const ref = expectString(value, path, 131);
    if (!/^\$\{[A-Z][A-Z0-9_]{0,127}\}$/.test(ref)) {
        throw new ProviderInstallationValidationError(
            "invalid_installation",
            "must be an exact secret reference",
            path,
        );
    }
    return ref;
}
