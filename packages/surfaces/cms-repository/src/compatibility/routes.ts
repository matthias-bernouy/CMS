import {
    IntegrationPackageValidationError,
    assertIntegrationPackageKind,
    assertIntegrationPackageVersion,
} from "@bernouy/cms-integration-packages";
import type {
    RepositoryCompatibilityPageRequest,
    RepositoryCompatibilityReader,
    RepositoryProjectedCompatibilityReader,
} from "./contracts";
import { PUBLIC_COMPATIBILITY_LIMITS } from "./limits";
import { projectPublicCompatibilityPage } from "./projection";
import { publicJsonResponse, publicNotFound } from "cms-repository/publicReadResponse";

export function integrationCompatibilityRouteHandler(
    reader: RepositoryCompatibilityReader,
): (request: Request) => Promise<Response> {
    return async (request) => {
        const { identity, page } = compatibilityRequest(request);
        const source = await reader.list(identity.kind, identity.version, page);
        if (!source) {
            return publicNotFound("integration compatibility report not found");
        }
        return publicJsonResponse(request, await projectPublicCompatibilityPage(source, identity, page), "catalog");
    };
}

export function integrationProjectedCompatibilityRouteHandler(
    reader: RepositoryProjectedCompatibilityReader,
): (request: Request) => Promise<Response> {
    return async (request) => {
        const { identity, page } = compatibilityRequest(request);
        const report = await reader.list(identity.kind, identity.version, page);
        return report
            ? publicJsonResponse(request, report, "catalog")
            : publicNotFound("integration compatibility report not found");
    };
}

function compatibilityRequest(request: Request): Readonly<{
    identity: Readonly<{ kind: string; version: string }>;
    page: RepositoryCompatibilityPageRequest;
}> {
    const url = new URL(request.url);
    const after = optionalCursor(url);
    return {
        identity: {
            kind: requiredIdentity(url, "kind", assertIntegrationPackageKind),
            version: requiredIdentity(url, "version", assertIntegrationPackageVersion),
        },
        page: {
            limit: pageLimit(url),
            ...(after ? { after } : {}),
        },
    };
}

function requiredIdentity(url: URL, name: "kind" | "version", validate: (value: unknown) => string): string {
    const value = singleValue(url, name, true);
    try {
        return validate(value);
    } catch (error) {
        if (error instanceof IntegrationPackageValidationError) {
            throw badRequest(error.message, error.code);
        }
        throw error;
    }
}

function pageLimit(url: URL): number {
    const value = singleValue(url, "limit", false);
    if (value === undefined) {
        return PUBLIC_COMPATIBILITY_LIMITS.defaultPageSize;
    }
    if (!/^[1-9]\d{0,2}$/.test(value)) {
        throw badRequest("Compatibility history limit must be from 1 to 100", "invalid_compatibility_limit");
    }
    const limit = Number(value);
    if (limit > PUBLIC_COMPATIBILITY_LIMITS.pageSize) {
        throw badRequest("Compatibility history limit must be from 1 to 100", "invalid_compatibility_limit");
    }
    return limit;
}

function optionalCursor(url: URL): string | undefined {
    const value = singleValue(url, "after", false);
    if (value === undefined) {
        return;
    }
    if (
        new TextEncoder().encode(value).byteLength > PUBLIC_COMPATIBILITY_LIMITS.identifierBytes ||
        /\p{Cc}/u.test(value)
    ) {
        throw badRequest("Compatibility history cursor is invalid", "invalid_compatibility_cursor");
    }
    return value;
}

function singleValue(url: URL, name: string, required: boolean): string | undefined {
    const values = url.searchParams.getAll(name);
    if (values.length > 1) {
        throw badRequest(`Param ${name} must be provided once`, `invalid_${name}`);
    }
    const value = values[0]?.trim();
    if (!value) {
        if (required) {
            throw badRequest(`Missing param ${name}`);
        }
        return;
    }
    return value;
}

function badRequest(message: string, publicCode?: string): Error {
    return Object.assign(new Error(message), { status: 400, ...(publicCode ? { publicCode } : {}) });
}
