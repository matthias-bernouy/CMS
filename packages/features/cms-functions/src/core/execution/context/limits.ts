export const MAX_FUNCTION_CALLS = 50;
export const MAX_FUNCTION_LOOP_ITEMS = 50;
export const MAX_FUNCTION_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_FUNCTION_CALL_ERROR_BYTES = 16 * 1024;
export const MIN_SCHEDULED_FUNCTION_INTERVAL_MS = 1_000;

const textEncoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
    return textEncoder.encode(value).byteLength;
}
