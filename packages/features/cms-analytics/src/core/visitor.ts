/**
 * Cookieless visitor identity. Pure given its inputs: the secret/IP/UA are passed in
 * (never read from env here, never persisted) and the daily salt rotates the id every
 * UTC day so visitors cannot be tracked across days.
 */

import { sha256HexAsync } from "cms-analytics/core/sha256Hex";

/** Per-day salt = sha256(secret | utcDay). Rotates daily; pair with `dayKey`. */
export function dailySalt(secret: string, day: string): Promise<string> {
    return sha256HexAsync(`${secret}|${day}`);
}

/** Anonymous visitor id = sha256(ip | ua | dailySalt). IP/UA never leave this call. */
export function visitorId(ip: string, ua: string, salt: string): Promise<string> {
    return sha256HexAsync(`${ip}|${ua}|${salt}`);
}
