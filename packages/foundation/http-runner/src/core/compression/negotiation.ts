/** Shared negotiation for retained representations and streamed responses. */
export function isCompressibleType(type: string | null): boolean {
    return Boolean(type && /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/iu.test(type));
}
function quality(value: string | null, coding: string): number | undefined {
    for (const token of value?.toLowerCase().split(",") ?? []) {
        const [name, ...parameters] = token.trim().split(";");
        if (name !== coding) {
            continue;
        }
        const parameter = parameters.find((part) => part.trim().startsWith("q="));
        const number = parameter ? Number(parameter.trim().slice(2)) : 1;
        return Number.isFinite(number) && number >= 0 && number <= 1 ? number : 0;
    }
    return undefined;
}
export function acceptsGzip(value: string | null): boolean {
    return (quality(value, "gzip") ?? quality(value, "*") ?? 0) > 0;
}
export function acceptsIdentity(value: string | null): boolean {
    return (quality(value, "identity") ?? (quality(value, "*") === 0 ? 0 : 1)) > 0;
}
