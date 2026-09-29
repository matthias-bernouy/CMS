import type { GatewayImageTransformer } from "./imageTransformer";
import { providerByteGeneration, providerDerivativeKey } from "./derivativeKey";
import { GatewayError } from "../core/GatewayError";
import type { GatewayInvocation, GatewayInvoker } from "../interfaces/Invocation";

export const PROVIDER_IMAGE_WIDTHS = Object.freeze([64, 128, 256, 384, 512, 768, 1024, 1280, 1600, 1920, 2560]);

export const PROVIDER_RESPONSIVE_WEBP_V1 = Object.freeze({
    id: "provider-responsive-webp",
    version: "1",
    widths: PROVIDER_IMAGE_WIDTHS,
    format: "webp" as const,
    quality: 75,
    maxSourceBytes: 10 * 1024 * 1024,
    maxOutputBytes: 5 * 1024 * 1024,
    maxInputPixels: 40_000_000,
    processingTimeoutMs: 10_000,
});

export interface ProviderImageDerivative {
    readonly bytes: Uint8Array;
    readonly etag: string;
    readonly width: number;
    readonly height: number;
}

export interface ProviderImageDerivativeStore {
    get(key: string): Promise<ProviderImageDerivative | null>;
    put(key: string, derivative: ProviderImageDerivative): Promise<void>;
}

export interface ProviderImageServiceOptions {
    readonly invoker: GatewayInvoker;
    readonly transformer: GatewayImageTransformer;
    readonly store: ProviderImageDerivativeStore;
    readonly maxConcurrent?: number;
}

/** Authorization always runs before cache lookup; byte fingerprints invalidate changed provider files. */
export class ProviderImageService {
    readonly #flights = new Map<string, Promise<ProviderImageDerivative>>();
    readonly #maxConcurrent: number;
    #active = 0;

    constructor(private readonly options: ProviderImageServiceOptions) {
        this.#maxConcurrent = options.maxConcurrent ?? 2;
        if (!Number.isSafeInteger(this.#maxConcurrent) || this.#maxConcurrent <= 0) {
            throw new TypeError("maxConcurrent must be a positive integer");
        }
    }

    async get(
        invocation: GatewayInvocation,
        width: number,
    ): Promise<ProviderImageDerivative | { readonly status: number }> {
        const recipe = PROVIDER_RESPONSIVE_WEBP_V1;
        if (!Number.isSafeInteger(width) || !recipe.widths.includes(width)) {
            throw new GatewayError("invalid_input", "image width is outside the declared recipe");
        }
        const result = await this.options.invoker.invoke(invocation);
        if (result.kind === "declared-error") {
            return { status: result.status };
        }
        if (result.kind !== "binary" || !result.media || result.bytes.byteLength > recipe.maxSourceBytes) {
            throw new GatewayError("invalid_provider_response", "provider did not return a bounded image file");
        }
        const fileId = (invocation.input as { fileId?: unknown } | null)?.fileId;
        if (
            !["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(result.contentType) ||
            result.media.siteId !== invocation.siteId ||
            result.media.contractId !== invocation.contractId ||
            result.media.capabilityId !== invocation.capabilityId ||
            result.media.fileId !== fileId ||
            result.media.generation !== (await providerByteGeneration(result.bytes))
        ) {
            throw new GatewayError("invalid_provider_response", "provider image identity or media type is invalid");
        }
        const key = await providerDerivativeKey(
            result.media,
            {
                id: recipe.id,
                version: recipe.version,
                encoder: this.options.transformer.encoderIdentity,
                widths: recipe.widths,
                formats: [recipe.format],
            },
            width,
            recipe.format,
        );
        const cached = await this.options.store.get(key);
        if (cached) {
            return cached;
        }
        const existing = this.#flights.get(key);
        if (existing) {
            return existing;
        }
        if (this.#active >= this.#maxConcurrent) {
            throw new GatewayError("media_busy", "image processing capacity is exhausted");
        }
        this.#active += 1;
        const flight = this.#transform(key, result.bytes, width).finally(() => {
            this.#flights.delete(key);
            this.#active -= 1;
        });
        this.#flights.set(key, flight);
        return flight;
    }

    async #transform(key: string, source: Uint8Array, width: number): Promise<ProviderImageDerivative> {
        const recipe = PROVIDER_RESPONSIVE_WEBP_V1;
        try {
            const metadata = await this.options.transformer.inspect(source, recipe);
            if (metadata.pages !== 1) {
                throw new TypeError("animated provider images are unsupported");
            }
            const result = await this.options.transformer.transform(source, {
                width: Math.min(width, metadata.width),
                recipe,
            });
            if (
                !result.bytes.byteLength ||
                result.bytes.byteLength > recipe.maxOutputBytes ||
                result.width <= 0 ||
                result.height <= 0
            ) {
                throw new TypeError("transformed provider image is invalid");
            }
            const derivative = {
                bytes: new Uint8Array(result.bytes),
                etag: `"${await providerByteGeneration(result.bytes)}"`,
                width: result.width,
                height: result.height,
            };
            await this.options.store.put(key, derivative);
            return derivative;
        } catch {
            throw new GatewayError("media_unavailable", "provider image processing failed");
        }
    }
}
