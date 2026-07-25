import type { SourceEndpoint } from "@bernouy/cms-sources";
import type { SourceImageRecipe } from "../interfaces/recipe";

const IDENTITY_HEADERS = ["accept", "accept-language", "content-type"] as const;

export async function sourceImageLogicalKey(options: {
    scope: string;
    endpoint: SourceEndpoint;
    request: Request;
    policy: "public" | "private";
}): Promise<string> {
    const url = new URL(options.request.url);
    const params = (options.endpoint.input?.params ?? [])
        .filter((param) => !param.name.trim().toLowerCase().startsWith("cms-"))
        .map((param) => [param.in, param.name, url.searchParams.get(param.name)] as const)
        .sort(compareTuple);
    const headers = IDENTITY_HEADERS.map((name) => [name, options.request.headers.get(name) ?? ""] as const);
    const authorizationPartition =
        options.policy === "public"
            ? "public"
            : await sha256Hex(
                  `${options.request.headers.get("authorization") ?? ""}\0${options.request.headers.get("cookie") ?? ""}`,
              );
    const endpointContractDigest = await sha256Hex(stableSerialize(options.endpoint));
    return opaqueKey("logical", {
        scope: options.scope,
        endpointContractDigest,
        params,
        headers,
        authorizationPartition,
    });
}

export async function sourceImageLookupKey(options: {
    logicalKey: string;
    width: number;
    recipe: SourceImageRecipe;
    encoderIdentity: string;
}): Promise<string> {
    return opaqueKey("lookup", options);
}

export async function sourceImagePublicFlightKey(lookupKey: string): Promise<string> {
    return opaqueKey("public-flight", { lookupKey });
}

export async function sourceImageDerivativeKey(options: {
    logicalKey: string;
    sourceDigest: string;
    effectiveWidth: number;
    recipe: SourceImageRecipe;
    encoderIdentity: string;
}): Promise<string> {
    return opaqueKey("derivative", {
        logicalKey: options.logicalKey,
        sourceDigest: options.sourceDigest,
        recipeId: options.recipe.id,
        effectiveWidth: options.effectiveWidth,
        encoderIdentity: options.encoderIdentity,
    });
}

export async function sourceImageDigest(bytes: Uint8Array): Promise<string> {
    return sha256Hex(bytes);
}

export async function sourceImageEtag(bytes: Uint8Array): Promise<string> {
    return `"sha256-${await sha256Hex(bytes)}"`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function opaqueKey(prefix: string, value: unknown): Promise<string> {
    return `${prefix}-${await sha256Hex(JSON.stringify(value))}`;
}

function compareTuple(
    left: readonly [string, string, string | null],
    right: readonly [string, string, string | null],
): number {
    return left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]);
}

function stableSerialize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
