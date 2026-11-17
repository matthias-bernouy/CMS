export type Statistics = Readonly<{
    count: number;
    minimum: number;
    maximum: number;
    p50: number;
    p95: number;
    total: number;
}>;

export function statistics(values: readonly number[]): Statistics {
    if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error("Performance samples must be nonempty, finite and nonnegative");
    }
    const ordered = values.toSorted((a, b) => a - b);
    const percentile = (ratio: number) => ordered[Math.ceil(ratio * ordered.length) - 1]!;
    return {
        count: ordered.length,
        minimum: ordered[0]!,
        maximum: ordered.at(-1)!,
        p50: percentile(0.5),
        p95: percentile(0.95),
        total: ordered.reduce((sum, value) => sum + value, 0),
    };
}

export function throughput(requests: number, elapsedMs: number): number {
    if (!Number.isSafeInteger(requests) || requests < 1 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
        throw new Error("Throughput requires a positive request count and elapsed time");
    }
    return (requests * 60_000) / elapsedMs;
}

export function regression(
    reference: number,
    candidate: number,
    limits: Readonly<{ relative: number; absolute: number }>,
): boolean {
    if (
        [reference, candidate, limits.relative, limits.absolute].some((value) => !Number.isFinite(value) || value < 0)
    ) {
        throw new Error("Regression comparison requires finite nonnegative values");
    }
    return candidate - reference > limits.absolute && candidate > reference * (1 + limits.relative);
}
