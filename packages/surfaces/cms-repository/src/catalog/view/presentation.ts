export function humanLabel(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replaceAll("-", " ")
        .replace(/^./, (first) => first.toUpperCase());
}

export function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) {
        return "Size unavailable";
    }
    if (bytes < 1_024) {
        return `${bytes} B`;
    }
    if (bytes < 1_024 * 1_024) {
        return `${(bytes / 1_024).toFixed(1)} KiB`;
    }
    return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
}

export function labeledValue(value: string): Readonly<{ value: string; label: string }> {
    return { value, label: humanLabel(value) };
}

export function labeledProviders(values: readonly string[]): readonly Readonly<{ name: string; label: string }>[] {
    return values.map((name) => ({ name, label: humanLabel(name) }));
}

export function labeledArtifacts(values: readonly Readonly<{ type: string; count: number }>[]) {
    return values.map(({ type, count }) => ({ type, label: humanLabel(type), count }));
}
