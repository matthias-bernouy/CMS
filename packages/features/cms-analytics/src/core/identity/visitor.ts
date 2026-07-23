import type { AnalyticsBrowser, AnalyticsDevice } from "../../interfaces/AnalyticsEvent";
import { ANALYTICS_VERSIONS } from "../../interfaces/AnalyticsPrivacy";

export type VisitorHashInput = {
    secret: string;
    siteScope: string;
    utcDay: string;
    ip: string;
    device: AnalyticsDevice;
    browser: AnalyticsBrowser;
};

export async function deriveVisitorHash(input: VisitorHashInput): Promise<string> {
    if (!input.secret.trim()) {
        throw new Error("analytics visitor secret is required");
    }
    if (!input.siteScope.trim()) {
        throw new Error("analytics site scope is required");
    }
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(input.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const payload = [
        ANALYTICS_VERSIONS.profile,
        input.siteScope,
        input.utcDay,
        truncateIpAddress(input.ip),
        input.device,
        input.browser,
    ].join("|");
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    return toHex(new Uint8Array(signature));
}

export function truncateIpAddress(raw: string): string {
    const value = raw.trim().toLowerCase().split("%", 1)[0] ?? "";
    const ipv4 = parseIpv4(value);
    if (ipv4) {
        return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.0/24`;
    }
    const ipv6 = parseIpv6(value);
    if (ipv6) {
        return `${ipv6
            .slice(0, 3)
            .map((part) => part.toString(16))
            .join(":")}::/48`;
    }
    return "unavailable";
}

function parseIpv4(value: string): number[] | null {
    const parts = value.split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
        return null;
    }
    const numbers = parts.map(Number);
    return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null;
}

function parseIpv6(value: string): number[] | null {
    if (!value.includes(":") || value.split("::").length > 2) {
        return null;
    }
    const [leftRaw, rightRaw] = value.split("::");
    const left = ipv6Parts(leftRaw ?? "");
    const right = ipv6Parts(rightRaw ?? "");
    if (!left || !right) {
        return null;
    }
    const missing = 8 - left.length - right.length;
    if ((value.includes("::") && missing < 1) || (!value.includes("::") && missing !== 0)) {
        return null;
    }
    return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv6Parts(value: string): number[] | null {
    if (!value) {
        return [];
    }
    const rawParts = value.split(":");
    const parts: number[] = [];
    for (const [index, part] of rawParts.entries()) {
        if (part.includes(".")) {
            if (index !== rawParts.length - 1) {
                return null;
            }
            const ipv4 = parseIpv4(part);
            if (!ipv4) {
                return null;
            }
            parts.push(ipv4[0]! * 256 + ipv4[1]!, ipv4[2]! * 256 + ipv4[3]!);
            continue;
        }
        if (!/^[0-9a-f]{1,4}$/.test(part)) {
            return null;
        }
        parts.push(Number.parseInt(part, 16));
    }
    return parts;
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
