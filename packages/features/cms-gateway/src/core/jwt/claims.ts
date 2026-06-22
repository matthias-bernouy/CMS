import type { JwtClaimValue } from "../../interfaces/Gateway";

export type ResolvedJwtClaimValue =
    | string
    | number
    | boolean
    | null
    | string[]
    | number[]
    | boolean[];

export type GatewayRequestContext = {
    userID?: string;
};

export type ResolveJwtClaimsDeps = {
    resolveContext?: (request: Request) => Promise<GatewayRequestContext>;
};

export type ResolveJwtClaimsResult =
    | { ok: true; claims: Record<string, ResolvedJwtClaimValue> }
    | { ok: false; status: 401 | 500; message: string };

export async function resolveJwtClaims(
    claims: Record<string, JwtClaimValue> | undefined,
    request: Request,
    deps: ResolveJwtClaimsDeps,
): Promise<ResolveJwtClaimsResult> {
    const out: Record<string, ResolvedJwtClaimValue> = {};
    for (const [name, value] of Object.entries(claims ?? {})) {
        if (value === "$userID") {
            if (!deps.resolveContext) {
                return { ok: false, status: 500, message: `claim "${name}" requires a configured gateway context resolver` };
            }
            const userId = (await deps.resolveContext(request)).userID;
            if (!userId) {
                return { ok: false, status: 401, message: `claim "${name}" requires an authenticated user` };
            }
            out[name] = userId;
            continue;
        }
        out[name] = value;
    }
    return { ok: true, claims: out };
}

export function validateJwtClaimsConfig(claims: unknown): string | null {
    if (claims === undefined) return null;
    if (!isRecord(claims)) return "jwt claims must be an object";
    for (const [name, value] of Object.entries(claims)) {
        if (!name) return "jwt claim name is required";
        if (!isJwtClaimValue(value)) return `jwt claim "${name}" has an invalid value`;
    }
    return null;
}

function isJwtClaimValue(value: unknown): value is JwtClaimValue {
    if (value === null) return true;
    if (typeof value === "string") return !value.startsWith("$") || value === "$userID";
    if (["number", "boolean"].includes(typeof value)) return true;
    if (Array.isArray(value)) return value.every(isArrayScalar);
    return false;
}

function isArrayScalar(value: unknown): value is string | number | boolean {
    if (typeof value === "string") return !value.startsWith("$");
    return ["number", "boolean"].includes(typeof value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
