import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

const RESERVED_SECRET_KEYS = new Set([SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY]);

export function isReservedSecretKey(key: string): boolean {
    return RESERVED_SECRET_KEYS.has(key);
}

export function assertGenericSecretKeyAllowed(key: string): void {
    if (isReservedSecretKey(key)) {
        throw new InvalidParam("key", "is reserved for connector provider credentials");
    }
}
