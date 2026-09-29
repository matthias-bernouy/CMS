import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";

export interface ProviderMediaIdentity {
    readonly siteId: string;
    readonly installationId: string;
    readonly contractId: string;
    readonly releaseDigest: `sha256:${string}`;
    readonly capabilityId: string;
    readonly fileId: string;
    /** Immutable byte generation, supplied by the provider file contract. */
    readonly generation: string;
}

export interface DerivativeRecipe {
    readonly id: string;
    readonly version: string;
    readonly encoder: string;
    readonly widths: readonly number[];
    readonly formats: readonly string[];
}

/** Identity of derivative bytes, distinct from an authorization-bearing lookup. */
export async function providerDerivativeKey(
    media: ProviderMediaIdentity,
    recipe: DerivativeRecipe,
    width: number,
    format: string,
): Promise<`sha256:${string}`> {
    for (const value of Object.values(media)) {
        if (typeof value !== "string" || !value.length || value.length > 256) {
            throw new TypeError("provider media identity must contain bounded nonempty strings");
        }
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(media.releaseDigest)) {
        throw new TypeError("provider media release digest is invalid");
    }
    for (const value of [recipe.id, recipe.version, recipe.encoder]) {
        if (!value || value.length > 128) {
            throw new TypeError("derivative recipe identity is invalid");
        }
    }
    if (!Number.isSafeInteger(width) || width <= 0 || !recipe.widths.includes(width)) {
        throw new TypeError("derivative width is outside the declared recipe");
    }
    if (!recipe.formats.includes(format) || !/^[a-z0-9]+$/.test(format)) {
        throw new TypeError("derivative format is outside the declared recipe");
    }
    const canonical = canonicalizeIJson({
        media,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        encoder: recipe.encoder,
        width,
        format,
    });
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
    return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
