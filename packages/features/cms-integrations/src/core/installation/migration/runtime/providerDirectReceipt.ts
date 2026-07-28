import { canonicalJsonBytes, parseStrictJsonDocument } from "@bernouy/cms-integration-packages";

export type ProviderDirectReceiptOperation = Readonly<{
    connectorKey: string;
    strategy: "expand-in-code" | "journalled-provider-switch";
    callbackIds: readonly string[];
    externalOperationId: string | null;
}>;

const RECEIPT_PREFIX = "provider-direct:";
const RECEIPT_SCHEMA = "cms.integration.provider-direct-receipt.v1";
const MAX_RECEIPT_BYTES = 64 * 1_024;
const MAX_EXTERNAL_OPERATION_ID_BYTES = 2_048;

export function encodeProviderDirectReceipt(operations: readonly ProviderDirectReceiptOperation[]): string {
    const ordered = [...operations].toSorted((left, right) => compareText(left.connectorKey, right.connectorKey));
    const bytes = canonicalJsonBytes({ schema: RECEIPT_SCHEMA, operations: ordered });
    if (bytes.byteLength > MAX_RECEIPT_BYTES) {
        throw new TypeError("Provider-direct migration receipt exceeds its byte limit");
    }
    return `${RECEIPT_PREFIX}${Buffer.from(bytes).toString("base64url")}`;
}

export function decodeProviderDirectReceipt(
    value: string | undefined,
): readonly ProviderDirectReceiptOperation[] | null {
    if (!value?.startsWith(RECEIPT_PREFIX)) {
        return null;
    }
    const encoded = value.slice(RECEIPT_PREFIX.length);
    if (!encoded || !/^[A-Za-z0-9_-]+$/u.test(encoded)) {
        return null;
    }
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.byteLength > MAX_RECEIPT_BYTES || bytes.toString("base64url") !== encoded) {
        return null;
    }
    try {
        const document = parseStrictJsonDocument(bytes, MAX_RECEIPT_BYTES);
        if (!sameBytes(canonicalJsonBytes(document), bytes)) {
            return null;
        }
        return parseReceipt(document);
    } catch {
        return null;
    }
}

function parseReceipt(value: unknown): readonly ProviderDirectReceiptOperation[] | null {
    if (
        !exactRecord(value, ["schema", "operations"]) ||
        value.schema !== RECEIPT_SCHEMA ||
        !Array.isArray(value.operations)
    ) {
        return null;
    }
    const operations: ProviderDirectReceiptOperation[] = [];
    const connectorKeys = new Set<string>();
    for (const entry of value.operations) {
        if (!exactRecord(entry, ["callbackIds", "connectorKey", "externalOperationId", "strategy"])) {
            return null;
        }
        if (
            typeof entry.connectorKey !== "string" ||
            !entry.connectorKey ||
            connectorKeys.has(entry.connectorKey) ||
            (entry.strategy !== "expand-in-code" && entry.strategy !== "journalled-provider-switch") ||
            !Array.isArray(entry.callbackIds) ||
            entry.callbackIds.some((callback) => typeof callback !== "string" || !callback) ||
            new Set(entry.callbackIds).size !== entry.callbackIds.length ||
            !isCanonicalOrder(entry.callbackIds) ||
            !validExternalOperationId(entry.externalOperationId, entry.strategy)
        ) {
            return null;
        }
        connectorKeys.add(entry.connectorKey);
        operations.push({
            connectorKey: entry.connectorKey,
            strategy: entry.strategy,
            callbackIds: entry.callbackIds,
            externalOperationId: entry.externalOperationId,
        });
    }
    return isCanonicalOrder(operations.map(({ connectorKey }) => connectorKey)) ? Object.freeze(operations) : null;
}

function validExternalOperationId(
    value: unknown,
    strategy: ProviderDirectReceiptOperation["strategy"],
): value is string | null {
    if (strategy === "expand-in-code") {
        return value === null;
    }
    return (
        typeof value === "string" &&
        value.trim() === value &&
        value.length > 0 &&
        Buffer.byteLength(value) <= MAX_EXTERNAL_OPERATION_ID_BYTES
    );
}

function exactRecord(value: unknown, fields: string[]): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).toSorted().join("\0") === [...fields].toSorted().join("\0")
    );
}

function isCanonicalOrder(values: readonly string[]): boolean {
    return values.every((value, index) => index === 0 || compareText(values[index - 1]!, value) < 0);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
