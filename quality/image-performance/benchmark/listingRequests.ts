import type { ListingLayout } from "../contracts";
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
): Promise<void> {
    await Promise.all(
        Array.from({ length: config.cardCount }, async (_, index) => {
            const asset = corpus.assets[index % corpus.assets.length]!;
            const width = selectedWidth(asset.width, config, layout, dpr);
            const url = new URL(`/image/${asset.assetId}`, origin);
            if (width) {
                url.searchParams.set("cms-width", String(width));
            }
            const startedAt = performance.now();
            try {
                const response = await fetch(url);
                const bytes = await response.arrayBuffer();
                imageDurations.push(performance.now() - startedAt);
                imageBytes.value += bytes.byteLength;
                if (!response.ok) {
                    failures.value++;
                }
            } catch {
                imageDurations.push(performance.now() - startedAt);
                failures.value++;
            }
        }),
    );
}

export async function requestForeground(origin: string, durations: number[]): Promise<void> {
    const startedAt = performance.now();
    const response = await fetch(new URL("/foreground", origin));
    await response.arrayBuffer();
    durations.push(performance.now() - startedAt);
    if (!response.ok) {
        throw new Error(`Foreground request failed with ${response.status}`);
    }
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
