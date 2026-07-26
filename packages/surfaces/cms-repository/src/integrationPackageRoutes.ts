import {
    INTEGRATION_PACKAGE_DIGEST_HEADER,
    IntegrationPackageValidationError,
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
    type IntegrationPackageSource,
    type ResolvedIntegrationPackage,
    type ResolvedIntegrationPackageMetadata,
} from "@bernouy/cms-integration-packages";
import { publicBytesResponse, publicMetadataResponse, publicNotFound } from "cms-repository/publicReadResponse";
import {
    guardPackageDownload,
    observePackageRead,
    type PublicPackageDownloadProtection,
} from "cms-repository/packageDownloadGuard";

export type IntegrationPackageRouteHandlers = {
    package(request: Request): Promise<Response>;
    releaseNotes(request: Request): Promise<Response>;
};

export function integrationPackageRouteHandlers(
    source: IntegrationPackageSource,
    protection: PublicPackageDownloadProtection,
): IntegrationPackageRouteHandlers {
    return {
        package: async (request) => {
            const identity = exactIdentity(request);
            const limited = await guardPackageDownload(
                request,
                protection,
                request.method === "GET" ? "download" : "metadata",
            );
            if (limited) {
                return limited;
            }
            if (request.method === "HEAD" && source.getPackageMetadata) {
                const metadata = await resolveExactPackageMetadata(identity, source.getPackageMetadata.bind(source));
                if (metadata instanceof Response) {
                    return metadata;
                }
                return publicMetadataResponse(
                    request,
                    metadata.canonicalBytes,
                    "immutable",
                    "application/json; charset=utf-8",
                    {
                        representationDigest: metadata.digest,
                        headers: { [INTEGRATION_PACKAGE_DIGEST_HEADER]: metadata.digest },
                    },
                );
            }
            const resolved = await resolveExactPackage(identity, source);
            if (resolved instanceof Response) {
                return resolved;
            }
            const response = publicBytesResponse(
                request,
                resolved.canonicalBytes,
                "immutable",
                "application/json; charset=utf-8",
                {
                    representationDigest: resolved.digest,
                    headers: { [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest },
                },
            );
            observeServedBytes(request, response, protection, "package", resolved.canonicalBytes.byteLength);
            return response;
        },
        releaseNotes: async (request) => {
            const identity = exactIdentity(request);
            const limited = await guardPackageDownload(request, protection, "metadata");
            if (limited) {
                return limited;
            }
            const resolved = await resolveExactPackage(identity, source);
            if (resolved instanceof Response) {
                return resolved;
            }
            const path = resolved.envelope.releaseNotes;
            if (!path) {
                return publicNotFound("integration release notes not found");
            }
            const notes = resolved.envelope.files[path];
            if (!notes || notes.encoding !== "utf8") {
                throw sourceContractError("Integration package release notes are invalid");
            }
            const bytes = new TextEncoder().encode(notes.content);
            const response = publicBytesResponse(request, bytes, "immutable", "text/markdown; charset=utf-8");
            observeServedBytes(request, response, protection, "release-notes", bytes.byteLength);
            return response;
        },
    };
}

function observeServedBytes(
    request: Request,
    response: Response,
    protection: PublicPackageDownloadProtection,
    resource: "package" | "release-notes",
    bytes: number,
): void {
    if (request.method === "GET" && response.status === 200) {
        observePackageRead(protection, { outcome: "served", resource, bytes });
    }
}

async function resolveExactPackageMetadata(
    identity: ExactPackageIdentity,
    load: (kind: string, version: string) => Promise<ResolvedIntegrationPackageMetadata | null>,
): Promise<ResolvedIntegrationPackageMetadata | Response> {
    const { kind, version } = identity;
    const resolved = await load(kind, version);
    if (!resolved) {
        return publicNotFound("integration package not found");
    }
    if (
        resolved.kind !== kind ||
        resolved.version !== version ||
        !/^[a-f0-9]{64}$/.test(resolved.digest) ||
        !Number.isSafeInteger(resolved.canonicalBytes) ||
        resolved.canonicalBytes < 0
    ) {
        throw sourceContractError("Integration package metadata does not match the requested version");
    }
    return resolved;
}

async function resolveExactPackage(
    identity: ExactPackageIdentity,
    source: IntegrationPackageSource,
): Promise<ResolvedIntegrationPackage | Response> {
    const { kind, version } = identity;
    const resolved = await source.getPackage(kind, version);
    if (!resolved) {
        return publicNotFound("integration package not found");
    }
    if (resolved.envelope.kind !== kind || resolved.envelope.version !== version) {
        throw sourceContractError("Integration package identity does not match the requested version");
    }
    if (!/^[a-f0-9]{64}$/.test(resolved.digest)) {
        throw sourceContractError("Integration package digest is invalid");
    }
    return resolved;
}

type ExactPackageIdentity = { kind: string; version: string };

function exactIdentity(request: Request): ExactPackageIdentity {
    const url = new URL(request.url);
    return {
        kind: requiredIdentity(url, "kind", assertIntegrationPackageKind),
        version: requiredIdentity(url, "version", assertIntegrationPackageVersion),
    };
}

function requiredIdentity(url: URL, name: "kind" | "version", validate: (value: unknown) => string): string {
    const value = url.searchParams.get(name)?.trim();
    if (!value) {
        throw badRequest(`Missing param ${name}`);
    }
    try {
        return validate(value);
    } catch (error) {
        if (error instanceof IntegrationPackageValidationError) {
            throw badRequest(error.message, error.code);
        }
        throw error;
    }
}

function badRequest(message: string, publicCode?: string): Error {
    return Object.assign(new Error(message), { status: 400, ...(publicCode ? { publicCode } : {}) });
}

function sourceContractError(message: string): Error {
    return Object.assign(new Error(message), { status: 500, publicCode: "integration_package_source_invalid" });
}
