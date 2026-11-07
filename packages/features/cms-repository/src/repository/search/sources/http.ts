import { discoveryTransportFailure } from "./errors";
import { RepositoryDiscoveryError } from "../core/errors";
import { repositoryBaseUrl } from "cms-repository/repository-http/baseUrl";
import { getRepositoryBytes } from "cms-repository/repository-http/getBytes";
import type { RepositoryFetch } from "cms-repository/repository-http/getBytes";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { searchPage } from "../core/page";
import { resourceReference, searchQuery, text } from "../core/input";
import type {
    RepositoryDiscoverySource,
    RepositoryResourceReference,
    RepositorySearchPage,
    RepositorySearchQuery,
} from "../interfaces";

export class HttpRepositoryDiscovery implements RepositoryDiscoverySource {
    private readonly base: URL;
    constructor(
        readonly id: string,
        baseUrl: string,
        private readonly options: { request?: RepositoryFetch; allowInsecureHttp?: boolean } = {},
    ) {
        text(id, 96);
        this.base = repositoryBaseUrl(baseUrl, "Discovery", options);
    }
    async search(query: RepositorySearchQuery): Promise<RepositorySearchPage> {
        const input = searchQuery(query);
        try {
            const bytes = await getRepositoryBytes(this.base, "v1/search", "Discovery", {
                maxBytes: 8 * 1024 * 1024,
                request: (url, init) =>
                    (this.options.request ?? fetch)(url, {
                        ...init,
                        method: "QUERY",
                        headers: { ...init.headers, "Content-Type": "application/json" },
                        body: JSON.stringify(input),
                    }),
            });
            try {
                const output = parseStrictJson(bytes, 8 * 1024 * 1024, 16);
                return searchPage(output);
            } catch {
                throw new RepositoryDiscoveryError("RELEASE_MISMATCH");
            }
        } catch (error) {
            throw discoveryTransportFailure(error, "search");
        }
    }

    async read(value: RepositoryResourceReference) {
        const reference = resourceReference(value);
        try {
            return await getRepositoryBytes(
                this.base,
                `v1/releases/${reference.kind}/${[reference.publisherId, reference.id, reference.version].map(encodeURIComponent).join("/")}`,
                "Discovery",
                { request: this.options.request },
            );
        } catch (error) {
            throw discoveryTransportFailure(error, "read");
        }
    }
}
