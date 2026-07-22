import { res } from "../../testUtils";

export function jsonSequence(payloads: unknown[]): void {
    let index = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(index, payloads.length - 1)];
        index++;
        return res(200, JSON.stringify(payload));
    }) as unknown as typeof fetch;
}

export function responseSequence(payloads: { status: number; body: string }[]): void {
    let index = 0;
    globalThis.fetch = (async () => {
        const payload = payloads[Math.min(index, payloads.length - 1)]!;
        index++;
        return res(payload.status, payload.body);
    }) as unknown as typeof fetch;
}

export function deferredJson(payload: unknown): () => void {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    globalThis.fetch = (async () => {
        await gate;
        return res(200, JSON.stringify(payload));
    }) as unknown as typeof fetch;
    return release;
}
