import type { Tenant, TenantCdnBucket, TenantKeycloak } from "src/interfaces/Tenant";
import { assertValidTenantId } from "src/core/validation/tenant/id";

// Wire shape is flat (matches what `<w13c-form>` submits — `Object.fromEntries`
// doesn't nest). The parser reshapes into the canonical nested entity here.
export type TenantCreateDto = Omit<Tenant, "createdAt" | "updatedAt">;

export function parseTenantCreateDto(body: Record<string, unknown>): TenantCreateDto {
    const { id, name } = body;
    assertValidTenantId(id);
    if (typeof name !== "string" || !name.trim()) throw new TypeError("name is required.");

    const keycloak = parseKeycloak(body);
    const assetsCdn = parseCdnBucket(body, "assetsCdn");

    return { id, name: name.trim(), keycloak, assetsCdn };
}

function requireString(body: Record<string, unknown>, key: string): string {
    const v = body[key];
    if (typeof v !== "string" || !v.trim()) throw new TypeError(`${key} is required.`);
    return v.trim();
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
    const v = body[key];
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string") throw new TypeError(`${key} must be a string.`);
    return v.trim();
}

function parseKeycloak(body: Record<string, unknown>): TenantKeycloak {
    const out: TenantKeycloak = {
        issuer:        requireString(body, "keycloak.issuer"),
        clientId:      requireString(body, "keycloak.clientId"),
        clientSecret:  requireString(body, "keycloak.clientSecret"),
        sessionSecret: requireString(body, "keycloak.sessionSecret"),
        adminRole:     requireString(body, "keycloak.adminRole"),
    };
    const cli = optionalString(body, "keycloak.cliClientId");
    if (cli) out.cliClientId = cli;
    return out;
}

function parseCdnBucket(body: Record<string, unknown>, prefix: string): TenantCdnBucket {
    return {
        url:              requireString(body, `${prefix}.url`),
        bucketCredential: requireString(body, `${prefix}.bucketCredential`),
    };
}
