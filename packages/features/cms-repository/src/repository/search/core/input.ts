import { isResourceId, resourcePublisher } from "cms-repository/exports/contracts/protocol";
import { RepositoryDiscoveryError } from "./errors";
import { isRepositoryIdentifier, isCanonicalSemVer } from "cms-repository/exports/contracts/compatibility";
import type { RepositorySearchQuery, RepositoryResourceReference } from "../interfaces";

export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !keys.includes(key))
    ) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository discovery input");
    }
    return value as Record<string, unknown>;
}
export function text(value: unknown, max = 128): string {
    if (typeof value !== "string" || !value.trim() || value.length > max || value !== value.toWellFormed()) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository discovery text");
    }
    return value;
}
export function limit(value: unknown, fallback = 10, maximum = 50): number {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository discovery limit");
    }
    return value as number;
}
export function searchQuery(value: unknown): RepositorySearchQuery {
    const input = object(value, ["query", "kinds", "publisherId", "contractId", "limit", "cursor", "channel"]);
    if (
        input.kinds !== undefined &&
        (!Array.isArray(input.kinds) ||
            input.kinds.length < 1 ||
            input.kinds.length > 4 ||
            new Set(input.kinds).size !== input.kinds.length ||
            Array.from(input.kinds).some(
                (kind) => !["collection", "bloc", "contract", "provider-manifest"].includes(kind),
            ))
    ) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository resource kinds");
    }
    if (input.channel !== undefined && !["stable", "beta", "all"].includes(input.channel as string)) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository release channel");
    }
    if (
        (input.contractId !== undefined && !isResourceId(input.contractId)) ||
        (input.publisherId !== undefined &&
            (typeof input.publisherId !== "string" || !isRepositoryIdentifier(input.publisherId)))
    ) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository identity filter");
    }
    return {
        channel: (input.channel ?? "stable") as "stable" | "beta" | "all",
        query: text(input.query, 2048),
        ...(input.kinds === undefined
            ? {}
            : {
                  kinds: [...(input.kinds as NonNullable<RepositorySearchQuery["kinds"]>)],
              }),
        ...(input.publisherId === undefined ? {} : { publisherId: text(input.publisherId, 96) }),
        ...(input.contractId === undefined ? {} : { contractId: text(input.contractId, 193) }),
        ...(input.cursor === undefined ? {} : { cursor: text(input.cursor, 8192) }),
        limit: limit(input.limit),
    };
}
export function resourceReference(value: unknown): RepositoryResourceReference {
    const input = object(value, ["kind", "publisherId", "id", "version", "digest"]);
    if (
        !["collection", "contract", "provider-manifest"].includes(input.kind as string) ||
        typeof input.publisherId !== "string" ||
        !isRepositoryIdentifier(input.publisherId) ||
        typeof input.id !== "string" ||
        !isResourceId(input.id) ||
        resourcePublisher(input.id) !== input.publisherId ||
        typeof input.digest !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(input.digest)
    ) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository resource reference");
    }
    if (!isCanonicalSemVer(text(input.version))) {
        throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository resource version");
    }
    return {
        kind: input.kind as RepositoryResourceReference["kind"],
        publisherId: input.publisherId as string,
        id: input.id as string,
        version: input.version as string,
        digest: input.digest as string,
    };
}
