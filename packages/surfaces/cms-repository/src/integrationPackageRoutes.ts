import {
    INTEGRATION_PACKAGE_DIGEST_HEADER,
    IntegrationPackageValidationError,
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
    type IntegrationPackageSource,
    type ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import { publicBytesResponse, publicNotFound } from "cms-repository/publicReadResponse";

export type IntegrationPackageRouteHandlers = {
    package(request: Request): Promise<Response>;
    releaseNotes(request: Request): Promise<Response>;
};

export function integrationPackageRouteHandlers(source: IntegrationPackageSource): IntegrationPackageRouteHandlers {
    return {
        package: async (request) => {
            const resolved = await resolveExactPackage(request, source);
            if (resolved instanceof Response) {
                return resolved;
            }
            return publicBytesResponse(
                request,
                resolved.canonicalBytes,
                "immutable",
                "application/json; charset=utf-8",
                {
                    representationDigest: resolved.digest,
                    headers: { [INTEGRATION_PACKAGE_DIGEST_HEADER]: resolved.digest },
                },
            );
        },
        releaseNotes: async (request) => {
            const resolved = await resolveExactPackage(request, source);
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
            return publicBytesResponse(
                request,
                new TextEncoder().encode(notes.content),
                "immutable",
                "text/markdown; charset=utf-8",
            );
        },
    };
}

async function resolveExactPackage(
    request: Request,
    source: IntegrationPackageSource,
): Promise<ResolvedIntegrationPackage | Response> {
    const url = new URL(request.url);
    const kind = requiredIdentity(url, "kind", assertIntegrationPackageKind);
    const version = requiredIdentity(url, "version", assertIntegrationPackageVersion);
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
