import { INTEGRATION_PACKAGE_DIGEST_HEADER } from "@bernouy/cms-integration-packages";
import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    IntegrationRepositoryUnavailableError,
} from "@bernouy/cms-integrations";

const SHA256 = /^[a-f0-9]{64}$/u;
const STRONG_ETAG = /^"([a-f0-9]{64})"$/u;

export type RepositoryHttpDocument<T> = Readonly<{ value: T; etag: string }>;
export type RepositoryPackageMetadata = Readonly<{ digest: string; canonicalBytes: number; etag: string }>;

export type RepositoryCatalogHttpTransportConfig = Readonly<{
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs: number;
}>;

export class RepositoryCatalogHttpTransport {
    private readonly baseUrl: URL;
    private readonly fetchImpl: typeof fetch;

    constructor(private readonly config: RepositoryCatalogHttpTransportConfig) {
        this.baseUrl = normalizedBaseUrl(config.baseUrl);
        this.fetchImpl = config.fetch ?? fetch;
        if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) {
            throw new RangeError("Repository catalog timeout must be a positive safe integer");
        }
    }

    async getJson(path: string, maxBytes: number): Promise<RepositoryHttpDocument<unknown> | null> {
        return await this.withResponse(path, "GET", "application/json", async (response) => {
            assertMediaType(response, "application/json");
            const bytes = await responseBytes(response, maxBytes);
            try {
                return {
                    value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
                    etag: etag(response),
                };
            } catch (error) {
                throw contractError(error);
            }
        });
    }

    async getText(path: string, maxBytes: number): Promise<RepositoryHttpDocument<string> | null> {
        return await this.withResponse(path, "GET", "text/markdown", async (response) => {
            assertMediaType(response, "text/markdown");
            const bytes = await responseBytes(response, maxBytes);
            try {
                return { value: new TextDecoder("utf-8", { fatal: true }).decode(bytes), etag: etag(response) };
            } catch (error) {
                throw contractError(error);
            }
        });
    }

    async headPackage(path: string, maxBytes: number): Promise<RepositoryPackageMetadata | null> {
        return await this.withResponse(path, "HEAD", "application/json", async (response) => {
            assertMediaType(response, "application/json");
            const canonicalBytes = contentLength(response, maxBytes, true)!;
            const digest = response.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER);
            const validator = etag(response);
            if (!digest || !SHA256.test(digest) || validator !== digest) {
                throw new IntegrationRepositoryContractError();
            }
            return { digest, canonicalBytes, etag: validator };
        });
    }

    private async withResponse<T>(
        path: string,
        method: "GET" | "HEAD",
        accept: string,
        operation: (response: Response) => Promise<T>,
    ): Promise<T | null> {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutResult = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new IntegrationRepositoryUnavailableError());
            }, this.config.timeoutMs);
        });
        try {
            return await Promise.race([
                (async () => {
                    const response = await this.fetchImpl(repositoryUrl(this.baseUrl, path), {
                        method,
                        headers: { accept },
                        credentials: "omit",
                        redirect: "error",
                        signal: controller.signal,
                    });
                    if (response.status === 404) {
                        return null;
                    }
                    if (response.status === 429 || response.status >= 500) {
                        throw new IntegrationRepositoryUnavailableError();
                    }
                    if (!response.ok) {
                        throw new IntegrationRepositoryContractError();
                    }
                    assertSameOrigin(response, this.baseUrl.origin);
                    return await operation(response);
                })(),
                timeoutResult,
            ]);
        } catch (error) {
            if (error instanceof IntegrationRepositoryError) {
                throw error;
            }
            throw new IntegrationRepositoryUnavailableError();
        } finally {
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
            controller.abort();
        }
    }
}

function normalizedBaseUrl(value: string): URL {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new TypeError("Public integration repository base URL is invalid");
    }
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return url;
}

function repositoryUrl(base: URL, path: string): URL {
    const url = new URL(path.replace(/^\/+/, ""), base);
    if (url.origin !== base.origin) {
        throw new TypeError("Repository catalog endpoint must remain same-origin");
    }
    return url;
}

function assertSameOrigin(response: Response, expectedOrigin: string): void {
    if (response.url && new URL(response.url).origin !== expectedOrigin) {
        throw new IntegrationRepositoryContractError();
    }
}

function assertMediaType(response: Response, expected: string): void {
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== expected) {
        throw new IntegrationRepositoryContractError();
    }
}

async function responseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
    const declared = contentLength(response, maxBytes, false);
    if (!response.body) {
        throw new IntegrationRepositoryContractError();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            if (!(value instanceof Uint8Array) || value.byteLength > maxBytes - total) {
                throw new IntegrationRepositoryContractError();
            }
            chunks.push(value);
            total += value.byteLength;
        }
    } finally {
        reader.releaseLock();
    }
    if (declared !== undefined && declared !== total) {
        throw new IntegrationRepositoryContractError();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

function contentLength(response: Response, maxBytes: number, required: boolean): number | undefined {
    const value = response.headers.get("content-length");
    if (value === null && !required) {
        return undefined;
    }
    if (value === null || !/^(0|[1-9][0-9]*)$/u.test(value)) {
        throw new IntegrationRepositoryContractError();
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > maxBytes) {
        throw new IntegrationRepositoryContractError();
    }
    return parsed;
}

function etag(response: Response): string {
    const match = STRONG_ETAG.exec(response.headers.get("etag") ?? "");
    if (!match) {
        throw new IntegrationRepositoryContractError();
    }
    return match[1]!;
}

function contractError(error: unknown): IntegrationRepositoryContractError {
    return error instanceof IntegrationRepositoryContractError ? error : new IntegrationRepositoryContractError();
}
