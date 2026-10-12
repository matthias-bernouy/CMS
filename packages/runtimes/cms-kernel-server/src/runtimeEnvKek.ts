import { parseBoolean, type RuntimeEnvSource } from "./runtimeEnvParsing";

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const HEX_256 = /^[0-9a-fA-F]{64}$/u;
const MAX_KEYS = 32;

export type RuntimeKekConfig = Readonly<{
    activeKeyId: string;
    keysHex: Readonly<Record<string, string>>;
    rotateOnStart: boolean;
}>;

export function parseRuntimeKekConfig(source: RuntimeEnvSource): RuntimeKekConfig {
    const rawLegacy = source.CMS_KEK_HEX?.trim();
    const legacyHex = rawLegacy ? parseHexKey(rawLegacy, "CMS_KEK_HEX") : undefined;
    const activeKeyId = source.CMS_KEK_ACTIVE_ID?.trim() || (legacyHex ? "legacy" : "");
    if (!activeKeyId) {
        throw new Error("CMS_KEK_ACTIVE_ID is required when CMS_KEK_HEX is absent");
    }
    assertKeyId(activeKeyId, "CMS_KEK_ACTIVE_ID");
    const keysHex: Record<string, string> = legacyHex ? { legacy: legacyHex } : {};
    const rawRing = source.CMS_KEK_RING_JSON?.trim();
    if (rawRing) {
        let decoded: unknown;
        try {
            decoded = JSON.parse(rawRing);
        } catch {
            throw new Error("CMS_KEK_RING_JSON must be a JSON object of key IDs to 32-byte hexadecimal keys");
        }
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
            throw new Error("CMS_KEK_RING_JSON must be a JSON object of key IDs to 32-byte hexadecimal keys");
        }
        const entries = Object.entries(decoded);
        for (const [keyId, rawKey] of entries) {
            assertKeyId(keyId, "CMS_KEK_RING_JSON key ID");
            if (typeof rawKey !== "string") {
                throw new Error(`CMS_KEK_RING_JSON key "${keyId}" must be a hexadecimal string`);
            }
            const key = parseHexKey(rawKey, `CMS_KEK_RING_JSON key "${keyId}"`);
            if (keyId === "legacy" && legacyHex && key !== legacyHex) {
                throw new Error('CMS_KEK_RING_JSON key "legacy" must match CMS_KEK_HEX');
            }
            keysHex[keyId] = key;
        }
    }
    if (Object.keys(keysHex).length > MAX_KEYS) {
        throw new Error(`The configured KEK ring must contain at most ${MAX_KEYS} keys`);
    }
    if (!(activeKeyId in keysHex)) {
        throw new Error(`CMS_KEK_ACTIVE_ID references missing key "${activeKeyId}"`);
    }
    return {
        activeKeyId,
        keysHex,
        rotateOnStart: parseBoolean(source.CMS_KEK_ROTATE_ON_START, "CMS_KEK_ROTATE_ON_START", false),
    };
}

function assertKeyId(keyId: string, name: string): void {
    if (!KEY_ID.test(keyId)) {
        throw new Error(`${name} must be 1-64 letters, numbers, dots, underscores, or hyphens`);
    }
}

function parseHexKey(raw: string, name: string): string {
    if (!HEX_256.test(raw)) {
        throw new Error(`${name} must be exactly 32 bytes encoded as 64 hexadecimal characters`);
    }
    return raw.toLowerCase();
}
