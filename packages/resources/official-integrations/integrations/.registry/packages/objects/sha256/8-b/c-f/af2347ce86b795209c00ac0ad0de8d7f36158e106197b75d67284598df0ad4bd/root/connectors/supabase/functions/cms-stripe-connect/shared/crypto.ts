export function safeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let result = 0;
    for (let i = 0; i < left.length; i++) {
        result |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return result === 0;
}

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function digest(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function stableStripeIdempotencyKey(namespace: string, businessKey: string): Promise<string> {
    return `cms:${namespace}:${await digest(businessKey)}`;
}
