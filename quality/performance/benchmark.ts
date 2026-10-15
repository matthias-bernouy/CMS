export type BenchmarkResult = Readonly<{
    name: string;
    samples: readonly number[];
    medianMs: number;
    p95Ms: number;
    minMs: number;
    maxMs: number;
}>;

type BenchmarkOptions = Readonly<{
    samples?: number;
    warmups?: number;
}>;

export async function benchmark(
    name: string,
    operation: () => unknown | Promise<unknown>,
    options: BenchmarkOptions = {},
): Promise<BenchmarkResult> {
    const samples = options.samples ?? sampleCount();
    const warmups = options.warmups ?? Math.min(3, samples);
    for (let index = 0; index < warmups; index += 1) {
        await operation();
    }
    const durations: number[] = [];
    for (let index = 0; index < samples; index += 1) {
        const startedAt = performance.now();
        await operation();
        durations.push(performance.now() - startedAt);
    }
    const sorted = durations.toSorted((left, right) => left - right);
    return {
        name,
        samples: durations,
        medianMs: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        minMs: sorted[0] ?? 0,
        maxMs: sorted.at(-1) ?? 0,
    };
}

export function assertMaximum(label: string, actual: number, maximum: number): void {
    if (actual > maximum) {
        throw new Error(`${label}: ${actual.toFixed(2)} exceeds the ${maximum.toFixed(2)} limit`);
    }
}

export function assertGrowth(label: string, smaller: BenchmarkResult, larger: BenchmarkResult, maximum: number): void {
    const growth = larger.medianMs / Math.max(smaller.medianMs, 0.01);
    if (growth > maximum) {
        throw new Error(`${label}: ${growth.toFixed(2)}x exceeds the ${maximum.toFixed(2)}x limit`);
    }
}

export function printResults(title: string, results: readonly BenchmarkResult[]): void {
    console.log(`\n${title}`);
    console.table(
        results.map(({ name, samples, medianMs, p95Ms, minMs, maxMs }) => ({
            benchmark: name,
            samples: samples.length,
            medianMs: rounded(medianMs),
            p95Ms: rounded(p95Ms),
            minMs: rounded(minMs),
            maxMs: rounded(maxMs),
        })),
    );
}

export function sampleCount(): number {
    const value = Number(process.env.ULVIA_PERF_SAMPLES ?? 10);
    if (!Number.isSafeInteger(value) || value < 3 || value > 100) {
        throw new TypeError("ULVIA_PERF_SAMPLES must be an integer between 3 and 100");
    }
    return value;
}

function percentile(sorted: readonly number[], ratio: number): number {
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function rounded(value: number): number {
    return Number(value.toFixed(2));
}
