import { mock } from "bun:test";
import type { SourceEndpoint, SourceEndpointInterceptor } from "@bernouy/cms-sources";
import {
    createSourceImageInterceptor,
    InMemorySourceImageCache,
    SourceImageSemaphore,
    type SourceImageObservation,
    type SourceImageRecipe,
    type SourceImageTransformer,
} from "@bernouy/cms-source-images";

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

export class FakeImageTransformer implements SourceImageTransformer {
    readonly encoderIdentity = "fake-webp-v1";
    inspectCalls = 0;
    transformCalls = 0;
    width = 1_000;
    height = 600;
    pages = 1;
    failInspect = false;
    failTransform = false;
    inspectDelayMs = 0;
    delayMs = 0;
    active = 0;
    maxActive = 0;

    async inspect() {
        this.inspectCalls += 1;
        this.active += 1;
        this.maxActive = Math.max(this.maxActive, this.active);
        try {
            if (this.inspectDelayMs) {
                await Bun.sleep(this.inspectDelayMs);
            }
            if (this.failInspect) {
                throw new Error("corrupt image");
            }
            return { format: "png" as const, width: this.width, height: this.height, pages: this.pages };
        } finally {
            this.active -= 1;
        }
    }

    async transform(_source: Uint8Array, options: { width: number; recipe: SourceImageRecipe }) {
        this.transformCalls += 1;
        this.active += 1;
        this.maxActive = Math.max(this.maxActive, this.active);
        try {
            if (this.delayMs) {
                await Bun.sleep(this.delayMs);
            }
            if (this.failTransform) {
                throw new Error("encode failed");
            }
            return {
                bytes: fakeWebP(options.width),
                width: options.width,
                height: Math.max(1, Math.round((options.width * this.height) / this.width)),
            };
        } finally {
            this.active -= 1;
        }
    }
}

export function imageEndpoint(overrides: Partial<SourceEndpoint> = {}): SourceEndpoint {
    return {
        urn: "urn:commerce:publicOfferImage",
        method: "GET",
        targetUrl: "https://example.test/image",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        input: {
            params: [{ name: "id", in: "query", required: true, schema: { type: "string" } }],
        },
        output: [{ status: "200" }],
        ...overrides,
    };
}

export function sourceRequest(width: number | string | undefined = 384, init: RequestInit = {}): Request {
    const url = new URL("https://cms.test/.cms/sources/commerce/publicOfferImage?id=offer-1");
    if (width !== undefined) {
        url.searchParams.set("cms-width", String(width));
    }
    return new Request(url, init);
}

export function upstreamImage(
    options: {
        bytes?: Uint8Array;
        status?: number;
        contentType?: string;
        cacheControl?: string;
        headers?: HeadersInit;
    } = {},
): Response {
    const headers = new Headers(options.headers);
    headers.set("content-type", options.contentType ?? "image/png");
    if (options.cacheControl !== null) {
        headers.set("cache-control", options.cacheControl ?? "public, max-age=3600");
    }
    return new Response((options.bytes ?? PNG_BYTES).slice().buffer, {
        status: options.status ?? 200,
        headers,
    });
}

export function interceptorHarness(
    options: {
        transformer?: FakeImageTransformer;
        cache?: InMemorySourceImageCache;
        access?: "public" | "auth" | "admin";
        now?: { value: number };
        semaphore?: SourceImageSemaphore;
        semaphoreWaitTimeoutMs?: number;
        recipe?: SourceImageRecipe;
        readTimeoutMs?: number;
    } = {},
) {
    const transformer = options.transformer ?? new FakeImageTransformer();
    const cache = options.cache ?? new InMemorySourceImageCache({ now: () => options.now?.value ?? 1_000 });
    const observations: SourceImageObservation[] = [];
    const endpoint = imageEndpoint({ access: { mode: options.access ?? "public" } });
    const interceptor = createSourceImageInterceptor({
        cache,
        transformer,
        scope: "site-test",
        ...(options.recipe ? { recipe: options.recipe } : {}),
        observe: (observation) => {
            observations.push(observation);
        },
        clock: () => options.now?.value ?? 1_000,
        ...(options.semaphore ? { semaphore: options.semaphore } : {}),
        ...(options.semaphoreWaitTimeoutMs !== undefined
            ? { semaphoreWaitTimeoutMs: options.semaphoreWaitTimeoutMs }
            : {}),
        ...(options.readTimeoutMs !== undefined ? { readTimeoutMs: options.readTimeoutMs } : {}),
    });
    const next = mock(async () => upstreamImage());
    return { interceptor, transformer, cache, observations, endpoint, next };
}

export async function invoke(
    interceptor: SourceEndpointInterceptor,
    endpoint: SourceEndpoint,
    request: Request,
    next: (request: Request) => Promise<Response>,
): Promise<Response> {
    return interceptor(endpoint, request, next);
}

export function fakeWebP(width: number): Uint8Array {
    const marker = new TextEncoder().encode(String(width));
    const bytes = new Uint8Array(12 + marker.byteLength);
    bytes.set(new TextEncoder().encode("RIFF"), 0);
    bytes.set(new TextEncoder().encode("WEBP"), 8);
    bytes.set(marker, 12);
    return bytes;
}
