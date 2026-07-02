export function envText(name: string): string {
    const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
    return deno?.env?.get?.(name)?.trim() ?? "";
}

export function envDefault(name: string, fallback: string): string {
    return envText(name) || fallback;
}

export function requiredEnv(name: string): string {
    const value = envText(name);
    if (!value) throw new Error(`${name} is required`);
    return value;
}

export function printableAscii(value: string): boolean {
    return /^[\x20-\x7E]*$/.test(value);
}
