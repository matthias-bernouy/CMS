import { SOURCE_IMAGE_JOB_SOURCE_HEADERS, SOURCE_IMAGE_JOB_VERSION, type SourceImageJob } from "../../interfaces/jobs";
import type { SourceImageRecipe } from "../../interfaces/recipe";

export function createSourceImageJob(options: {
    scope: string;
    request: Request;
    logicalKey: string;
    variants: SourceImageJob["variants"];
    recipe: SourceImageRecipe;
    encoderIdentity: string;
    priority?: SourceImageJob["priority"];
    asset?: SourceImageJob["asset"];
}): SourceImageJob {
    const requestUrl = new URL(options.request.url);
    const sourceBase = publicSourceBase(options.scope) ?? requestUrl;
    const sourceUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, sourceBase);
    sourceUrl.hash = "";
    for (const name of [...sourceUrl.searchParams.keys()]) {
        if (name.trim().toLowerCase().startsWith("cms-")) {
            sourceUrl.searchParams.delete(name);
        }
    }
    const headers: Partial<Record<(typeof SOURCE_IMAGE_JOB_SOURCE_HEADERS)[number], string>> = {};
    for (const name of SOURCE_IMAGE_JOB_SOURCE_HEADERS) {
        const value = options.request.headers.get(name);
        if (value) {
            headers[name] = value;
        }
    }
    const variants = Object.freeze(
        [...options.variants]
            .sort((left, right) => left.width - right.width)
            .map((variant) => Object.freeze({ ...variant })),
    );
    const identity = options.asset
        ? `${options.asset.key}:${options.asset.generation}`
        : `${options.logicalKey}:${options.recipe.id}:${options.encoderIdentity}`;
    return Object.freeze({
        version: SOURCE_IMAGE_JOB_VERSION,
        deduplicationKey: `source-image-set:${identity}`,
        source: Object.freeze({ url: sourceUrl.href, headers: Object.freeze(headers) }),
        logicalKey: options.logicalKey,
        variants,
        recipeId: options.recipe.id,
        encoderIdentity: options.encoderIdentity,
        priority: options.priority ?? "media-cache",
        ...(options.asset ? { asset: Object.freeze({ ...options.asset }) } : {}),
    });
}

export function publicSourceOrigin(scope: string): string | null {
    return publicSourceBase(scope)?.origin ?? null;
}

function publicSourceBase(scope: string): URL | null {
    try {
        const url = new URL(scope);
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}
