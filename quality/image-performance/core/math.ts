export function percentile(values: readonly number[], quantile: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
    return sorted[index] ?? 0;
}

export function rounded(value: number, precision = 3): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}

export function delta(after: number, before: number): number {
    return Math.max(0, after - before);
}
