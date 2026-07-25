import { isIP } from "node:net";
import { getRequestIP } from "./ip";

export type ClientAddressPolicy =
    | { mode: "disabled" }
    | { mode: "direct" }
    | { mode: "trusted-proxy"; trustedProxyHops: number };

export class InvalidForwardedChainError extends Error {
    readonly status = 400;
    readonly publicCode = "invalid_forwarded_chain";

    constructor() {
        super("Forwarded client address chain is invalid");
        this.name = "InvalidForwardedChainError";
    }
}

export function resolveClientAddress(request: Request, policy: ClientAddressPolicy): string | undefined {
    if (policy.mode === "disabled") {
        return undefined;
    }
    const peer = normalizeIpAddress(getRequestIP(request));
    if (!peer) {
        if (policy.mode === "trusted-proxy") {
            throw new InvalidForwardedChainError();
        }
        return undefined;
    }
    if (isLoopbackAddress(peer)) {
        return "loopback";
    }
    if (policy.mode === "direct") {
        return peer;
    }
    assertTrustedProxyHops(policy.trustedProxyHops);
    const forwarded = request.headers.get("x-forwarded-for");
    const rawChain = [...(forwarded ? forwarded.split(",") : []), peer];
    if (rawChain.length <= policy.trustedProxyHops) {
        throw new InvalidForwardedChainError();
    }
    const chain = rawChain.map((entry) => normalizeIpAddress(entry.trim()));
    if (chain.some((entry) => !entry)) {
        throw new InvalidForwardedChainError();
    }
    return chain[chain.length - policy.trustedProxyHops - 1]!;
}

export function normalizeIpAddress(value: string | undefined): string | undefined {
    if (!value || value !== value.trim() || value.includes("%")) {
        return undefined;
    }
    const version = isIP(value);
    if (version === 4) {
        return value
            .split(".")
            .map((part) => String(Number(part)))
            .join(".");
    }
    if (version !== 6) {
        return undefined;
    }
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
}

function assertTrustedProxyHops(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError("trustedProxyHops must be a positive safe integer");
    }
}

function isLoopbackAddress(address: string): boolean {
    if (address === "::1" || address.startsWith("127.")) {
        return true;
    }
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
    if (!mapped) {
        return false;
    }
    const high = Number.parseInt(mapped[1]!, 16);
    return high >> 8 === 127;
}
