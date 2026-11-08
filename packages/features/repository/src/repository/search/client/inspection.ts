import { RepositoryDiscoveryError } from "../core/errors";
import { limit, object, resourceReference, text } from "../core/input";
import type { RepositoryDiscoverySource } from "../interfaces";
import { readResourceContent } from "./content";

/** Exact verified projections only, bounded independently of response continuation size. */
export class RepositoryInspection {
    private readonly entries = new Map<string, string>();
    private readonly pending = new Map<string, Promise<string>>();
    private bytes = 0;
    constructor(private readonly maximumBytes = 16 * 1024 * 1024) {
        if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 16 * 1024 * 1024) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid metadata cache budget");
        }
    }
    async get(sources: ReadonlyMap<string, RepositoryDiscoverySource>, value: unknown) {
        const input = object(value, ["repositoryId", "reference", "blocId", "exampleId", "offset", "limit"]);
        const source = sources.get(text(input.repositoryId, 96));
        if (!source) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Repository is not configured");
        }
        const reference = resourceReference(input.reference);
        const blocId = input.blocId === undefined ? undefined : text(input.blocId);
        const exampleId = input.exampleId === undefined ? undefined : text(input.exampleId);
        if ((blocId && exampleId) || ((blocId || exampleId) && reference.kind !== "collection")) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid collection resource selector");
        }
        const offset = input.offset ?? 0;
        if (!Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > 8388608) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository read offset");
        }
        const maximum = limit(input.limit, 12000, 16000);
        const key = JSON.stringify([
            source.id,
            reference.kind,
            reference.publisherId,
            reference.id,
            reference.version,
            reference.digest,
            blocId,
            exampleId,
        ]);
        const content = await this.load(key, () => readResourceContent(source, reference, blocId, exampleId));
        const start = offset as number;
        if (
            content.length > 8388608 ||
            start > content.length ||
            (start > 0 && /[\uDC00-\uDFFF]/u.test(content[start]!))
        ) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Invalid repository read boundary");
        }
        let end = Math.min(content.length, start + maximum);
        if (end < content.length && /[\uDC00-\uDFFF]/u.test(content[end]!)) {
            end--;
        }
        if (end === start && start < content.length) {
            throw new RepositoryDiscoveryError("INVALID_INPUT", "Read limit cannot split a Unicode character");
        }
        return {
            reference,
            content: content.slice(start, end),
            offset: start,
            total: content.length,
            ...(end < content.length ? { nextOffset: end } : {}),
        };
    }
    private async load(key: string, read: () => Promise<string>): Promise<string> {
        const cached = this.entries.get(key);
        if (cached !== undefined) {
            this.entries.delete(key);
            this.entries.set(key, cached);
            return cached;
        }
        const pending = this.pending.get(key);
        if (pending) {
            return pending;
        }
        if (this.pending.size >= 8) {
            throw new RepositoryDiscoveryError("CORE_UNAVAILABLE");
        }
        const flight = read()
            .then((content) => {
                const size = content.length * 2;
                if (size > this.maximumBytes) {
                    return content;
                }
                while (this.entries.size && (this.entries.size >= 8 || this.bytes + size > this.maximumBytes)) {
                    const oldest = this.entries.keys().next().value!;
                    this.bytes -= this.entries.get(oldest)!.length * 2;
                    this.entries.delete(oldest);
                }
                this.entries.set(key, content);
                this.bytes += size;
                return content;
            })
            .finally(() => {
                this.pending.delete(key);
            });
        this.pending.set(key, flight);
        return flight;
    }
}
