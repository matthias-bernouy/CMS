import { CollectionDiscoveryMetadata } from "./metadata";
import { createHash } from "node:crypto";
import type { CollectionRepositorySource, CollectionVerifier } from "@bernouy/cms-repository/collections/sources";
import { releaseChannel } from "@bernouy/cms-repository/contracts/compatibility";
import type { CmsCollectionDependencies } from "../../../ports";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import { requiredText, integer } from "../collections/support";
import { releaseAction } from "./catalogue";
import type { CollectionSourceCaches } from "./cache";

/** Only the requested page is hydrated. Immutable evidence is shared; site actions stay fresh. */
export class CollectionDiscovery {
    constructor(
        private readonly store: CmsCollectionDependencies["collections"],
        private readonly sources: ReadonlyMap<string, CollectionRepositorySource>,
        verifier: CollectionVerifier,
        caches: CollectionSourceCaches,
    ) {
        this.metadata = new CollectionDiscoveryMetadata(sources, verifier, caches);
    }
    private readonly metadata: CollectionDiscoveryMetadata;

    async list(siteId: string, input: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
        const { channel, limit } = pageOptions(input);
        const sources = [...this.sources.values()].sort((a, b) => a.id.localeCompare(b.id));
        const fingerprint = createHash("sha256")
            .update(JSON.stringify([channel, sources.map(({ id }) => id)]))
            .digest("hex");
        let index = 0;
        let cursor: string | undefined;
        if (input.cursor) {
            try {
                const decoded: unknown = JSON.parse(Buffer.from(requiredText(input.cursor), "base64url").toString());
                if (
                    !Array.isArray(decoded) ||
                    decoded.length !== 3 ||
                    decoded[0] !== fingerprint ||
                    !Number.isSafeInteger(decoded[1]) ||
                    decoded[1] < 0 ||
                    decoded[1] >= sources.length ||
                    (decoded[2] !== null && (typeof decoded[2] !== "string" || decoded[2].length > 1024))
                ) {
                    throw new Error("Invalid cursor");
                }
                index = decoded[1];
                cursor = decoded[2] ?? undefined;
            } catch {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
        }
        const snapshot = await this.store.listInstalled(siteId);
        const releases = [];
        let nextCursor: string | undefined;
        while (index < sources.length && releases.length < limit) {
            signal?.throwIfAborted();
            const source = sources[index]!;
            if (!source.page) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            const page = await source.page(
                { mode: "latest", channel, limit: limit - releases.length, ...(cursor ? { cursor } : {}) },
                signal,
            );
            releases.push(...page.entries);
            if (page.nextCursor) {
                if (!page.entries.length || page.nextCursor === cursor) {
                    throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
                }
                nextCursor = Buffer.from(JSON.stringify([fingerprint, index, page.nextCursor])).toString("base64url");
                break;
            }
            index++;
            cursor = undefined;
            if (index < sources.length) {
                nextCursor = Buffer.from(JSON.stringify([fingerprint, index, null])).toString("base64url");
            } else {
                nextCursor = undefined;
            }
        }
        const verified = await this.metadata.page(releases, signal);
        return {
            revision: snapshot.revision,
            channel,
            releases: verified.map((entry) => {
                const installed = snapshot.items.find(({ collectionId }) => collectionId === entry.collectionId);
                return {
                    ...entry,
                    channel: releaseChannel(entry.version),
                    action: releaseAction(entry, installed),
                    ...(installed ? { installedVersion: installed.version } : {}),
                };
            }),
            nextCursor: nextCursor ?? "",
        };
    }

    async history(siteId: string, input: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
        const { channel, limit } = pageOptions({ ...input, channel: input.channel ?? "all" });
        const source = this.metadata.source(requiredText(input.repositoryId));
        if (!source.page) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const page = await source.page(
            {
                mode: "history",
                channel,
                limit,
                publisherId: requiredText(input.publisherId),
                collectionId: requiredText(input.collectionId),
                ...(input.cursor ? { cursor: requiredText(input.cursor) } : {}),
            },
            signal,
        );
        const snapshot = await this.store.listInstalled(siteId);
        const verified = await this.metadata.page(page.entries, signal);
        return {
            revision: snapshot.revision,
            repositoryId: source.id,
            publisherId: requiredText(input.publisherId),
            collectionId: requiredText(input.collectionId),
            channel,
            releases: verified.map((entry) => ({
                ...entry,
                channel: releaseChannel(entry.version),
                action: releaseAction(
                    entry,
                    snapshot.items.find(({ collectionId }) => collectionId === entry.collectionId),
                ),
            })),
            nextCursor: page.nextCursor ?? "",
        };
    }

    async review(siteId: string, input: Readonly<Record<string, unknown>>, signal?: AbortSignal) {
        const evidence = await this.metadata.get(input, signal);
        const snapshot = await this.store.listInstalled(siteId);
        return {
            ...evidence,
            action: releaseAction(
                evidence,
                snapshot.items.find((item) => item.collectionId === evidence.collectionId),
            ),
        };
    }
}

function pageOptions(input: Readonly<Record<string, unknown>>) {
    const channel = input.channel ?? "stable";
    const limit = input.limit === undefined ? 25 : integer(input.limit);
    if (!["stable", "beta", "all"].includes(String(channel)) || limit < 1 || limit > 25) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return { channel: channel as "stable" | "beta" | "all", limit };
}
