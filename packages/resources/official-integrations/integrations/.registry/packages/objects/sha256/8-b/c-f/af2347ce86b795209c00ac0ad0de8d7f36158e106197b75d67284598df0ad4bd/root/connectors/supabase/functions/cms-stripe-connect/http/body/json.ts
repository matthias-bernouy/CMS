import { isRecord } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { HttpError } from "../errors.ts";

export async function readJsonObject(request: Request): Promise<JsonRecord> {
    let value: unknown;
    try {
        value = await request.json();
    } catch {
        throw new HttpError(400, "invalid JSON body");
    }
    if (!isRecord(value)) {
        throw new HttpError(400, "body must be an object");
    }
    return value;
}

export function assertOnlyKeys(body: JsonRecord, allowed: string[]): void {
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) {
        throw new HttpError(400, `${unexpected} is not accepted; submit Stripe token ids and the contact email only`);
    }
}

export function assertAllowedKeys(body: JsonRecord, allowed: string[]): void {
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) {
        throw new HttpError(400, `${unexpected} is not allowed`);
    }
}
