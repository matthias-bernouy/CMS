import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { RepositoryReleaseReader, RepositoryVerificationBundleReader } from "./releaseContracts";
import { projectPublicRepositoryRelease } from "./releaseProjection";
import { publicBytesResponse, publicJsonResponse, publicNotFound } from "../publicReadResponse";

export function integrationReleaseRouteHandler(reader: RepositoryReleaseReader) {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const kind = requiredValue(url, "kind", assertIntegrationPackageKind);
        const version = requiredValue(url, "version", assertIntegrationPackageVersion);
        const release = await reader.get(kind, version);
        return release
            ? publicJsonResponse(request, projectPublicRepositoryRelease(release), "catalog")
            : publicNotFound("integration release evidence not found");
    };
}

export function integrationVerificationBundleRouteHandler(reader: RepositoryVerificationBundleReader) {
    return async (request: Request): Promise<Response> => {
        const digest = singleQueryValue(new URL(request.url), "digest");
        if (!digest || !/^[a-f0-9]{64}$/u.test(digest)) {
            throw badRequest("Verification bundle digest is invalid");
        }
        const bundle = await reader.get(digest);
        if (!bundle || bundle.digest !== digest) {
            return publicNotFound("integration verification bundle not found");
        }
        return publicBytesResponse(request, bundle.canonicalBytes, "immutable", "application/json");
    };
}

function requiredValue(url: URL, name: string, validate: (value: unknown) => string): string {
    const value = singleQueryValue(url, name);
    if (!value) {
        throw badRequest(`Missing param ${name}`);
    }
    try {
        return validate(value);
    } catch {
        throw badRequest(`Param ${name} is invalid`);
    }
}

function singleQueryValue(url: URL, name: string): string | undefined {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) {
        throw badRequest(`Param ${name} must be provided once`);
    }
    return values[0]?.trim() || undefined;
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}
