/**
 * Cookieless visitor identity. Pure given its inputs: the secret/IP/UA are passed in
 * (never read from env here, never persisted) and the daily salt rotates the id every
 * UTC day so visitors cannot be tracked across days. See §1/§4.4 of ANALYTICS_PLAN.md.
 */

import { sha256Hex } from "@bernouy/core";

/** Per-day salt = sha256(secret | utcDay). Rotates daily; pair with `dayKey`. */
export function dailySalt(secret: string, day: string): Promise<string> {
    return sha256Hex(`${secret}|${day}`);
}

/** Anonymous visitor id = sha256(ip | ua | dailySalt). IP/UA never leave this call. */
export function visitorId(ip: string, ua: string, salt: string): Promise<string> {
    return sha256Hex(`${ip}|${ua}|${salt}`);
}
