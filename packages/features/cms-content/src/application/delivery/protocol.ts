import { deliveryOperations } from "./operations";
import type { DeliveryInputs, DeliveryOperation, DeliveryResults } from "./interfaces";
import { array, fields, text } from "./validation/values";

const MAX_BYTES = 7 * 1024 * 1024;
const CHUNK_LENGTH = 1024 * 1024;
const envelope = fields({ chunks: array(text, 7) });
export function deliveryOperation(value: unknown): DeliveryOperation {
    if (typeof value !== "string" || !Object.hasOwn(deliveryOperations, value)) {
        throw new TypeError("Unknown content delivery operation");
    }
    return value as DeliveryOperation;
}
export function parseDeliveryInput<K extends DeliveryOperation>(operation: K, input: unknown): DeliveryInputs[K] {
    deliveryOperations[operation].input(input);
    return structuredClone(input) as DeliveryInputs[K];
}
export function parseDeliveryValue<K extends DeliveryOperation>(operation: K, value: unknown): DeliveryResults[K] {
    deliveryOperations[operation].output(value);
    return structuredClone(value) as DeliveryResults[K];
}
export function decodeDeliveryOutput<K extends DeliveryOperation>(operation: K, value: unknown): DeliveryResults[K] {
    envelope(value);
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) {
        throw new TypeError("Content delivery exceeds its byte budget");
    }
    const { chunks } = value as { chunks: string[] };
    return parseDeliveryValue(operation, JSON.parse(chunks.join("")));
}
export function encodeDeliveryOutput<K extends DeliveryOperation>(operation: K, value: unknown): { chunks: string[] } {
    const json = JSON.stringify(value);
    if (typeof json !== "string") {
        throw new TypeError("Content delivery value is not serializable");
    }
    if (json.length > MAX_BYTES) {
        throw Object.assign(new TypeError("Content delivery exceeds its byte budget"), { status: 413 });
    }
    parseDeliveryValue(operation, value);
    const chunks: string[] = [];
    for (let index = 0; index < json.length; ) {
        let end = Math.min(index + CHUNK_LENGTH, json.length);
        const last = json.charCodeAt(end - 1);
        if (end < json.length && last >= 0xd800 && last <= 0xdbff) {
            end -= 1;
        }
        chunks.push(json.slice(index, end));
        index = end;
    }
    const output = { chunks };
    envelope(output);
    if (new TextEncoder().encode(JSON.stringify(output)).byteLength > MAX_BYTES) {
        throw Object.assign(new TypeError("Content delivery exceeds its byte budget"), { status: 413 });
    }
    return output;
}
