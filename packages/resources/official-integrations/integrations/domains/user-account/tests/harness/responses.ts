import { expect } from "bun:test";
import type { JsonRecord } from "./types";

export async function jsonBody(response: Response): Promise<JsonRecord> {
    return (await response.json()) as JsonRecord;
}

export async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}
