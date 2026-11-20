export async function definitionHash(json: string): Promise<string> {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)));
    return `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
export function definitionKind(key: string): "contract" | "manifest" {
    if (!/^(contract|manifest):sha256:[a-f0-9]{64}$/u.test(key)) {
        throw new TypeError("Gateway definition key is invalid");
    }
    return key.startsWith("contract:") ? "contract" : "manifest";
}
export function retainedDefinitionBytes(value: unknown, maximum: number): number {
    const seen = new Set<object>();
    const remaining = [value];
    let bytes = 0;
    while (remaining.length) {
        const item = remaining.pop();
        if (typeof item === "string") {
            bytes += 24 + item.length * 2;
        } else if (item !== null && typeof item === "object" && !seen.has(item)) {
            seen.add(item);
            bytes += 64;
            for (const [key, child] of Object.entries(item)) {
                bytes += 24 + key.length * 2;
                remaining.push(child);
            }
        } else {
            bytes += 8;
        }
        if (bytes > maximum) {
            return bytes;
        }
    }
    return bytes;
}
