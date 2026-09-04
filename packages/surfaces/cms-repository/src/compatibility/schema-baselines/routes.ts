import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { RepositorySchemaBaselineReader } from "./contracts";
import { publicJsonResponse } from "../../publicReadResponse";

const SHA256_HEX = /^[a-f0-9]{64}$/u;

export function integrationSchemaBaselinesRouteHandler(reader: RepositorySchemaBaselineReader) {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const kind = requiredValue(url, "kind", assertIntegrationPackageKind);
        const version = requiredValue(url, "version", assertIntegrationPackageVersion);
        const packageDigest = requiredValue(url, "packageDigest", (value) => {
            if (typeof value !== "string" || !SHA256_HEX.test(value)) {
                throw new TypeError("Invalid SHA-256 digest");
            }
            return value;
        });
        return publicJsonResponse(request, await reader.listForPackage(kind, version, packageDigest), "catalog");
    };
}

function requiredValue(url: URL, name: string, validate: (value: unknown) => string): string {
    const values = url.searchParams.getAll(name);
    if (values.length !== 1 || !values[0]?.trim()) {
        throw badRequest(values.length > 1 ? `Param ${name} must be provided once` : `Missing param ${name}`);
    }
    try {
        return validate(values[0].trim());
    } catch {
        throw badRequest(`Param ${name} is invalid`);
    }
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}
