export function formBody(init: RequestInit): URLSearchParams {
    return init.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init.body ?? ""));
}

export function stableSuffix(value: string): string {
    let hash = 2_166_136_261;
    for (const code of new TextEncoder().encode(value)) {
        hash = Math.imul(hash ^ code, 16_777_619) >>> 0;
    }
    return hash.toString(36).padStart(7, "0");
}
