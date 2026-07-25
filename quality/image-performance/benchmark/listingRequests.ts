import { imageSize } from "image-size";
import type { AdapterImplementation, ListingLayout } from "../contracts";
import type { LoadedCorpus } from "../core/corpus";
import type { ListingBenchmarkConfig } from "./listingBenchmark";

export async function runListingUser(
    origin: string,
    corpus: LoadedCorpus,
    config: ListingBenchmarkConfig,
    layout: ListingLayout,
    dpr: number,
    imageDurations: number[],
    imageBytes: { value: number },
    failures: { value: number },
    implementation: AdapterImplementation,
): Promise<void> {
    await Promise.all(
        Array.from({ length: config.cardCount }, async (_, index) => {
            const asset = corpus.assets[index % corpus.assets.length]!;
            const width = selectedWidth(asset.width, config, layout, dpr);
            const url = new URL(`/image/${asset.assetId}`, origin);
            if (implementation.mode === "source-image" && width) {
                url.searchParams.set("cms-width", String(width));
            }
            const startedAt = performance.now();
            try {
                const response = await fetch(url);
                const bytes = new Uint8Array(await response.arrayBuffer());
                imageDurations.push(performance.now() - startedAt);
                imageBytes.value += bytes.byteLength;
                if (!validImageResponse(response, bytes, asset, width, implementation.mode)) {
                    failures.value++;
                }
            } catch {
                imageDurations.push(performance.now() - startedAt);
                failures.value++;
            }
        }),
    );
}

function validImageResponse(
    response: Response,
    bytes: Uint8Array,
    asset: LoadedCorpus["assets"][number],
    selected: number | undefined,
    mode: AdapterImplementation["mode"],
): boolean {
    try {
        const dimensions = imageSize(bytes);
        const expectedWidth = mode === "source-image" && selected ? Math.min(selected, asset.width) : asset.width;
        const expectedType = mode === "source-image" ? "webp" : asset.mediaType.split("/")[1]?.replace("jpeg", "jpg");
        return (
            response.ok &&
            response.headers.get("content-type") === (mode === "source-image" ? "image/webp" : asset.mediaType) &&
            dimensions.width === expectedWidth &&
            dimensions.type === expectedType
        );
    } catch {
        return false;
    }
}

export async function requestForeground(origin: string, sequence: number, durations: number[]): Promise<void> {
    const startedAt = performance.now();
    const url = new URL("/foreground", origin);
    url.searchParams.set("sequence", String(sequence));
    const response = await fetch(url);
    await response.arrayBuffer();
    durations.push(performance.now() - startedAt);
    if (!response.ok) {
        throw new Error(`Foreground request failed with ${response.status}`);
    }
}

export async function runSustainedForeground(options: {
    work: Promise<void>;
    minimumRequests: number;
    concurrency: number;
    request(sequence: number): Promise<void>;
    pace?: () => Promise<void>;
}): Promise<void> {
    let workSettled = false;
    let workError: unknown;
    const trackedWork = options.work.then(
        () => {
            workSettled = true;
        },
        (error: unknown) => {
            workSettled = true;
            workError = error;
        },
    );
    let nextSequence = 0;
    const worker = async () => {
        while (!workSettled || nextSequence < options.minimumRequests) {
            const sequence = nextSequence++;
            await options.request(sequence);
            if (!workSettled || nextSequence < options.minimumRequests) {
                await (options.pace?.() ?? pacedForegroundRequest());
            }
        }
    };
    const results = await Promise.allSettled([
        trackedWork,
        ...Array.from({ length: Math.max(1, options.concurrency) }, () => worker()),
    ]);
    const requestError = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (workError !== undefined) {
        throw workError;
    }
    if (requestError) {
        throw requestError.reason;
    }
}

function pacedForegroundRequest(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5));
}

function selectedWidth(
    sourceWidth: number,
    config: ListingBenchmarkConfig,
    layout: ListingLayout,
    dpr: number,
): number | undefined {
    const displayWidth = config.viewportWidth * (layout === "narrow" ? 0.3 : 1);
    const required = Math.ceil(displayWidth * dpr);
    const producible = config.ladder.filter((width) => width <= sourceWidth);
    return producible.find((width) => width >= required) ?? producible.at(-1);
}
