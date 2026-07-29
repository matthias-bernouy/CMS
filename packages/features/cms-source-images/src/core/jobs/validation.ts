import { sourceImageLookupKey } from "../identity";
import { SOURCE_IMAGE_JOB_SOURCE_HEADERS, SOURCE_IMAGE_JOB_VERSION, type SourceImageJob } from "../../interfaces/jobs";
import type { SourceImageRecipe } from "../../interfaces/recipe";

const OPAQUE_LOGICAL_KEY = /^logical-[a-f0-9]{64}$/;
const OPAQUE_LOOKUP_KEY = /^lookup-[a-f0-9]{64}$/;

export async function validateSourceImageJob(options: {
    job: SourceImageJob;
    recipe: SourceImageRecipe;
    encoderIdentity: string;
    allowedOrigins: ReadonlySet<string>;
}): Promise<Request | null> {
    const { job } = options;
    if (
        job.version !== SOURCE_IMAGE_JOB_VERSION ||
        job.recipeId !== options.recipe.id ||
        job.encoderIdentity !== options.encoderIdentity ||
        !OPAQUE_LOGICAL_KEY.test(job.logicalKey) ||
        !validVariants(job, options.recipe) ||
        job.deduplicationKey !== expectedDeduplicationKey(job)
    ) {
        return null;
    }
    for (const variant of job.variants) {
        const expectedLookupKey = await sourceImageLookupKey({
            logicalKey: job.logicalKey,
            width: variant.width,
            recipe: options.recipe,
            encoderIdentity: options.encoderIdentity,
        });
        if (expectedLookupKey !== variant.lookupKey) {
            return null;
        }
    }
    const url = validSourceUrl(job.source.url, options.allowedOrigins);
    const headers = validSourceHeaders(job.source.headers);
    if (!url || !headers) {
        return null;
    }
    return new Request(url, { method: "GET", headers, redirect: "manual" });
}

function validVariants(job: SourceImageJob, recipe: SourceImageRecipe): boolean {
    if (job.variants.length < 1 || job.variants.length > recipe.widths.length) {
        return false;
    }
    let previous = 0;
    for (const variant of job.variants) {
        if (
            variant.width <= previous ||
            !recipe.widths.includes(variant.width) ||
            !OPAQUE_LOOKUP_KEY.test(variant.lookupKey)
        ) {
            return false;
        }
        previous = variant.width;
    }
    return true;
}

function expectedDeduplicationKey(job: SourceImageJob): string {
    const identity = job.asset
        ? `${job.asset.key}:${job.asset.generation}`
        : `${job.logicalKey}:${job.recipeId}:${job.encoderIdentity}`;
    return `source-image-set:${identity}`;
}

export function normalizedSourceImageOrigins(values: readonly string[]): ReadonlySet<string> {
    if (values.length === 0) {
        throw new TypeError("at least one source image job origin is required");
    }
    return new Set(
        values.map((value) => {
            const url = new URL(value);
            if (
                (url.protocol !== "http:" && url.protocol !== "https:") ||
                url.username ||
                url.password ||
                url.origin === "null"
            ) {
                throw new TypeError("source image job origins must be absolute HTTP origins");
            }
            return url.origin;
        }),
    );
}

function validSourceUrl(value: string, allowedOrigins: ReadonlySet<string>): URL | null {
    if (typeof value !== "string" || value.length > 8_192) {
        return null;
    }
    try {
        const url = new URL(value);
        if (
            (url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password ||
            url.hash ||
            !allowedOrigins.has(url.origin) ||
            !url.pathname.startsWith("/.cms/sources/")
        ) {
            return null;
        }
        if ([...url.searchParams.keys()].some((name) => name.trim().toLowerCase().startsWith("cms-"))) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

function validSourceHeaders(value: SourceImageJob["source"]["headers"]): Headers | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const allowed = new Set<string>(SOURCE_IMAGE_JOB_SOURCE_HEADERS);
    const headers = new Headers();
    let totalLength = 0;
    for (const [name, headerValue] of Object.entries(value)) {
        if (!allowed.has(name) || typeof headerValue !== "string" || headerValue.length > 8_192) {
            return null;
        }
        totalLength += headerValue.length;
        if (totalLength > 16_384) {
            return null;
        }
        headers.set(name, headerValue);
    }
    return headers;
}
