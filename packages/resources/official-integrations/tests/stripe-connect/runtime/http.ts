import { expect } from "bun:test";
import type { JsonRecord } from "./types";

export function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    return input instanceof Request ? input : new Request(input, init);
}

export function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "content-type": "application/json" },
    });
}

export async function jsonBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export async function stripeSignature(payload: string, secret: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `t=${timestamp},v1=${hex}`;
}

export async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}
