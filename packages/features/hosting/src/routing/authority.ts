import { createHmac, timingSafeEqual } from "node:crypto";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { domainHostname } from "hosting/core/origin";
import type { HostedRoute, EdgeRoute } from "hosting/interfaces/routing";
import { EDGE_LEASE_PREFIX } from "./protocol";

const LEASE_MS = 60_000;
type Lease = readonly [
    hostname: string,
    domainRevision: number,
    instanceRevision: number,
    expiresAt: number,
    fence: string,
];

/** Scoped Edge credentials never contain a tenant's persistent access token or signing secret. */
export class RoutingAuthority {
    constructor(
        private readonly domains: { resolve(hostname: string): Promise<HostedRoute | null> },
        private readonly secret: string,
        private readonly resources: (instanceId: string) => Promise<string>,
        private readonly now: () => number = Date.now,
    ) {
        if (secret.length < 32) {
            throw new TypeError("Routing lease signing requires at least 32 characters");
        }
    }

    async resolve(value: string): Promise<EdgeRoute | null> {
        const hostname = domainHostname(value);
        const route = await this.domains.resolve(hostname);
        if (!route) {
            return null;
        }
        const expiresAt = this.now() + LEASE_MS;
        const payload = Buffer.from(
            JSON.stringify([hostname, route.domainRevision, route.instanceRevision, expiresAt, this.fence(route)]),
        ).toString("base64url");
        const controlLease = `${EDGE_LEASE_PREFIX}${payload}.${this.mac(payload).toString("base64url")}`;
        if (controlLease.length > 512) {
            throw new TypeError("Routing lease exceeds the control credential bound");
        }
        return {
            ...route,
            hostname,
            expiresAt,
            controlLease,
            resourceRevision: await this.resources(route.instanceId),
        };
    }

    async authorizeControlToken(token: string): Promise<HostedRoute | null> {
        const lease = this.decode(token);
        if (!lease) {
            return null;
        }
        const [hostname, domainRevision, instanceRevision, expiresAt, fence] = lease;
        const route = await this.domains.resolve(hostname);
        if (
            !route ||
            route.domainRevision !== domainRevision ||
            route.instanceRevision !== instanceRevision ||
            this.now() >= expiresAt ||
            !equal(this.fence(route), fence)
        ) {
            return null;
        }
        return route;
    }

    private decode(token: string): Lease | null {
        try {
            if (!token.startsWith(EDGE_LEASE_PREFIX) || token.length > 512) {
                return null;
            }
            const [payload, signature, extra] = token.slice(EDGE_LEASE_PREFIX.length).split(".");
            if (
                !payload ||
                !signature ||
                extra !== undefined ||
                !/^[A-Za-z0-9_-]+$/u.test(payload) ||
                !/^[A-Za-z0-9_-]{43}$/u.test(signature) ||
                !equal(this.mac(payload).toString("base64url"), signature)
            ) {
                return null;
            }
            const bytes = Buffer.from(payload, "base64url");
            if (bytes.toString("base64url") !== payload) {
                return null;
            }
            const value = parseStrictJson(bytes, 512, 2);
            if (!Array.isArray(value) || value.length !== 5) {
                return null;
            }
            const [hostname, domainRevision, instanceRevision, expiresAt, fence] = value;
            if (
                typeof hostname !== "string" ||
                domainHostname(hostname) !== hostname ||
                !positive(domainRevision) ||
                !positive(instanceRevision) ||
                !positive(expiresAt) ||
                expiresAt <= this.now() ||
                expiresAt > this.now() + LEASE_MS ||
                typeof fence !== "string" ||
                !/^[A-Za-z0-9_-]{22}$/u.test(fence)
            ) {
                return null;
            }
            return [hostname, domainRevision, instanceRevision, expiresAt, fence];
        } catch {
            return null;
        }
    }

    private fence(route: HostedRoute) {
        return createHmac("sha256", this.secret)
            .update(`ulvia-edge-fence/v1\0${route.instanceId}\0${route.origin}\0${route.canonicalOrigin}`)
            .digest()
            .subarray(0, 16)
            .toString("base64url");
    }
    private mac(payload: string) {
        return createHmac("sha256", this.secret).update(`ulvia-edge-control/v1\0${payload}`).digest();
    }
}
function positive(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) > 0;
}
function equal(expected: string, actual: string) {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);
    return a.length === b.length && timingSafeEqual(a, b);
}
