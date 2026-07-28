import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { RepositoryCatalogQueryContext } from "../contracts";

const ALLOWED_PARAMS = new Set(["q", "category", "provider", "compatibility", "kind", "version"]);
const FILTER_PARAMS = ["q", "category", "provider", "compatibility"] as const;
const MAX_FILTER_CHARACTERS = 128;

export type RepositoryCatalogApiQuery = Readonly<{
    kind?: string;
    version?: string;
    context: RepositoryCatalogQueryContext;
}>;

export function parseRepositoryCatalogApiQuery(request: Request): RepositoryCatalogApiQuery {
    const params = new URL(request.url).searchParams;
    for (const name of params.keys()) {
        if (!ALLOWED_PARAMS.has(name)) {
            throw badRequest(`Unsupported param ${name}`);
        }
        if (params.getAll(name).length > 1) {
            throw badRequest(`Param ${name} must be provided once`);
        }
    }
    const values: Record<string, readonly string[]> = {};
    for (const name of FILTER_PARAMS) {
        const value = (params.get(name) ?? "").trim().slice(0, MAX_FILTER_CHARACTERS);
        if (value) {
            values[name] = [value];
        }
    }
    const kind = validatedIdentity(params.get("kind"), "kind", assertIntegrationPackageKind);
    const version = validatedIdentity(params.get("version"), "version", assertIntegrationPackageVersion);
    if (version && !kind) {
        throw badRequest("Param version requires param kind");
    }
    return {
        kind,
        version,
        context: { searchParams: values },
    };
}

function validatedIdentity(raw: string | null, name: string, validate: (value: unknown) => string): string | undefined {
    const value = raw?.trim();
    if (!value) {
        return;
    }
    try {
        return validate(value);
    } catch {
        throw badRequest(`Param ${name} is invalid`);
    }
}

function badRequest(message: string): Error & { status: number } {
    return Object.assign(new Error(message), { status: 400 });
}
