import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { getRepositoryBytes } from "cms-repository/repository-http/getBytes";
import type { CollectionPublisher } from "../../CollectionAuthoring";

/** One preparation owns its byte budget, request count and four network slots. */
export function dependencyReader(publisher: CollectionPublisher) {
    const origin = repositoryBaseUrl(publisher.repositoryUrl, "Authoring", publisher);
    const waiting: (() => void)[] = [];
    let active = 0;
    let bytesRead = 0;
    let requests = 0;
    return async (path: string, options: { query?: Readonly<Record<string, unknown>>; maxBytes?: number }) => {
        if (++requests > 128) {
            throw new Error("Preparation exceeds 128 dependency requests");
        }
        while (active >= 4) {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }
        active++;
        try {
            const bytes = await getRepositoryBytes(origin, path, "Authoring", {
                ...options,
                maxBytes: 1024 * 1024,
            }).catch(() => {
                throw new AuthoringDependencyError();
            });
            bytesRead += bytes.byteLength;
            if (bytesRead > 8 * 1024 * 1024) {
                throw new Error("Preparation contract metadata exceeds 8 MiB");
            }
            return bytes;
        } finally {
            active--;
            waiting.shift()?.();
        }
    };
}
export class AuthoringDependencyError extends Error {
    constructor() {
        super("Repository dependency lookup is temporarily unavailable");
    }
}
