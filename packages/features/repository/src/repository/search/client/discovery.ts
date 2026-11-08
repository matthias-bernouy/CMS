import { RepositoryDiscoveryError, discoveryFailure } from "../core/errors";
import { sha256Digest } from "@bernouy/binary-media";
import { compareSemVer, releaseChannel } from "@bernouy/ulvia-contracts/compatibility";
import { object, searchQuery, text } from "../core/input";
import { RepositoryInspection } from "./inspection";
import type {
    RepositoryDiscoverySource,
    RepositorySearchPage,
    RepositorySearchResult,
} from "repository/repository/search/interfaces";

type LocatedResult = RepositorySearchResult & { repositoryId: string };

/** Searches only injected sources; no user-controlled network destination or implicit installation. */
export class RepositoryDiscovery {
    private readonly sources: ReadonlyMap<string, RepositoryDiscoverySource>;
    private active = 0;
    private readonly inspection = new RepositoryInspection();
    constructor(sources: readonly RepositoryDiscoverySource[]) {
        this.sources = new Map(sources.map((source) => [text(source.id, 96), source]));
        if (sources.length > 8 || this.sources.size !== sources.length) {
            throw new RepositoryDiscoveryError(
                "INVALID_INPUT",
                "Repository discovery accepts up to eight unique sources",
            );
        }
    }
    async search(value: unknown) {
        const input = object(value, [
            "query",
            "channel",
            "kinds",
            "publisherId",
            "contractId",
            "limit",
            "cursor",
            "repositoryIds",
        ]);
        const { repositoryIds, ...queryInput } = input;
        const query = searchQuery(queryInput);
        const selectedIds = repositoryIds === undefined ? [...this.sources.keys()] : repositoryIds;
        const ids = Array.isArray(selectedIds) ? [...selectedIds] : selectedIds;
        if (
            !Array.isArray(ids) ||
            ids.length > 8 ||
            (repositoryIds !== undefined && ids.length < 1) ||
            new Set(ids).size !== ids.length ||
            Array.from(ids).some((id) => typeof id !== "string" || !this.sources.has(id))
        ) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Repository is not configured");
        }
        return this.admit(async () => {
            const pages: { id: string; page?: RepositorySearchPage }[] = new Array(ids.length);
            let next = 0;
            await Promise.all(
                Array.from({ length: Math.min(4, ids.length) }, async () => {
                    while (next < ids.length) {
                        const index = next++;
                        const id = ids[index] as string;
                        try {
                            pages[index] = {
                                id,
                                page: await this.sources.get(id)!.search({ ...query, cursor: undefined, limit: 50 }),
                            };
                        } catch {
                            pages[index] = { id };
                        }
                    }
                }),
            );
            const unavailableRepositories = pages.filter(({ page }) => !page).map(({ id }) => id);
            const candidates = new Map<string, { result: LocatedResult; score: number }>();
            for (const { id, page } of pages) {
                page?.results.forEach((result, rank) => {
                    const key = `${result.reference.kind}\0${result.reference.publisherId}\0${result.reference.id}\0${releaseChannel(result.reference.version)}\0${result.blocId ?? ""}`;
                    const previous = candidates.get(key);
                    const version = previous
                        ? compareSemVer(result.reference.version, previous.result.reference.version)
                        : 1;
                    if (!previous || version > 0) {
                        candidates.set(key, { result: { ...result, repositoryId: id }, score: 1 / (61 + rank) });
                    } else if (version === 0 && result.reference.digest === previous.result.reference.digest) {
                        previous.score += 1 / (61 + rank);
                    } else if (version === 0) {
                        // Conflicting immutable bytes remain separate, with their source visible.
                        candidates.set(`${key}\0${id}`, {
                            result: { ...result, repositoryId: id },
                            score: 1 / (61 + rank),
                        });
                    }
                });
            }
            const exact = query.query.trim().toLowerCase();
            const ordered = [...candidates.values()]
                .sort((left, right) => {
                    const matches = (result: LocatedResult) =>
                        Number((result.blocId ?? result.reference.id).toLowerCase() === exact);
                    return matches(right.result) - matches(left.result) || right.score - left.score;
                })
                .map(({ result }) => result);
            const fingerprint = (
                await sha256Digest(
                    new TextEncoder().encode(
                        JSON.stringify({ query: { ...query, cursor: undefined, limit: undefined }, pages }),
                    ),
                )
            ).slice(7);
            let offset = 0;
            if (query.cursor) {
                const match = /^([a-f0-9]{64}):(\d{1,3})$/u.exec(query.cursor);
                if (!match || match[1] !== fingerprint || Number(match[2]) > ordered.length) {
                    throw new RepositoryDiscoveryError("REVISION_CONFLICT");
                }
                offset = Number(match[2]);
            }
            const end = offset + query.limit!;
            const degraded =
                unavailableRepositories.length > 0 || pages.some(({ page }) => page?.degraded) || pages.length === 0;
            return {
                mode: pages.some(({ page }) => page?.mode === "hybrid") ? ("hybrid" as const) : ("lexical" as const),
                degraded,
                partial: unavailableRepositories.length > 0,
                unavailableRepositories,
                results: structuredClone(ordered.slice(offset, end)),
                ...(end < ordered.length ? { nextCursor: `${fingerprint}:${end}` } : {}),
            };
        });
    }
    get(value: unknown) {
        return this.admit(() => this.inspection.get(this.sources, value));
    }
    private async admit<T>(operation: () => Promise<T>): Promise<T> {
        if (this.active >= 8) {
            throw new RepositoryDiscoveryError("CORE_UNAVAILABLE");
        }
        this.active++;
        try {
            return await operation();
        } catch (error) {
            throw discoveryFailure(error);
        } finally {
            this.active--;
        }
    }
}
