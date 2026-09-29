import { isIP } from "node:net";

export interface ResolvedAddress {
    readonly address: string;
    readonly family: 4 | 6;
}

/** Reject every non-public target, except canonical HTTP loopback installations. */
export function selectGatewayAddress(origin: URL, addresses: readonly ResolvedAddress[]): ResolvedAddress {
    if (addresses.length === 0) {
        throw new TypeError("provider hostname did not resolve");
    }
    const hostname = origin.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(hostname);
    if (
        literalFamily !== 0 &&
        (addresses.length !== 1 || addresses[0]?.address !== hostname || addresses[0]?.family !== literalFamily)
    ) {
        throw new TypeError("literal provider origin must dial its own address");
    }
    const loopbackHttp = origin.protocol === "http:" && isLoopbackLiteral(origin.hostname);
    for (const candidate of addresses) {
        if (isIP(candidate.address) !== candidate.family) {
            throw new TypeError("provider DNS returned an invalid address");
        }
        if (loopbackHttp) {
            if (!isLoopbackLiteral(candidate.address)) {
                throw new TypeError("loopback origin resolved outside loopback");
            }
        } else if (!isPublicAddress(candidate)) {
            throw new TypeError("provider DNS returned a non-public address");
        }
    }
    return addresses[0]!;
}

export function isLoopbackLiteral(value: string): boolean {
    return value === "[::1]" || value === "::1" || /^127(?:\.\d{1,3}){3}$/.test(value);
}

function isPublicAddress(candidate: ResolvedAddress): boolean {
    if (candidate.family === 4) {
        const bytes = candidate.address.split(".").map(Number);
        const [a, b, c] = bytes;
        return !(
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b! >= 64 && b! <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b! >= 16 && b! <= 31) ||
            (a === 192 && (b === 168 || b === 0 || b === 88)) ||
            (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
            (a === 203 && b === 0 && c === 113) ||
            a! >= 224
        );
    }
    const first = Number.parseInt(candidate.address.split(":", 1)[0] ?? "", 16);
    return first >= 0x2000 && first <= 0x3fff && !/^2001:db8:/i.test(candidate.address);
}
