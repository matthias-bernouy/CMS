import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    IntegrationRepositoryUnavailableError,
} from "../../core/errors";
import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";
import { responseAsset } from "./httpDefinitionAssets";
import { responseJson } from "./httpDefinitionResponse";

export const DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS = 10_000;

type HttpDefinitionTransportConfig = {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeadersInit;
    timeoutMs: number;
};

export class HttpDefinitionTransport {
    private readonly baseUrl: URL;
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly config: HttpDefinitionTransportConfig) {
        this.baseUrl = normalizedBaseUrl(config.baseUrl);
        this.fetchImpl = config.fetch ?? fetch;
        this.timeoutMs = parseTimeout(config.timeoutMs);
    }

    async getJson(path: string): Promise<unknown> {
        return await this.withResponse(path, false, responseJson);
    }

    async getJsonOrNull(path: string): Promise<unknown | null> {
        return await this.withResponse(path, true, responseJson);
    }

    async getAsset(path: string, maxBytes?: number): Promise<IntegrationAsset | null> {
        return await this.withResponse(
            path,
            true,
            async (response, signal) =>
                await parseRepositoryContractAsync(() => responseAsset(response, maxBytes, signal)),
        );
    }

    private async withResponse<T>(
        path: string,
        nullable: boolean,
        operation: (response: Response, signal: AbortSignal) => Promise<T>,
    ): Promise<T | null> {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutResult = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new IntegrationRepositoryUnavailableError());
            }, this.timeoutMs);
        });
        const request = (async () => {
            const response = await this.fetchImpl(repositoryUrl(this.baseUrl, path), {
                credentials: "omit",
                headers: requestHeaders(this.config.headers),
                redirect: "error",
                signal: controller.signal,
            });
            await assertResponseLocation(response, this.baseUrl);
            if (nullable && response.status === 404) {
                await cancelResponse(response);
                return null;
            }
            await assertResponseStatus(response);
            return await operation(response, controller.signal);
        })();
        request.catch(() => undefined);
        try {
            return await Promise.race([request, timeoutResult]);
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

export function parseRepositoryContract<T>(operation: () => T): T {
    try {
        return operation();
    } catch (error) {
        if (error instanceof IntegrationRepositoryError) {
            throw error;
        }
        throw new IntegrationRepositoryContractError();
    }
}

export async function parseRepositoryContractAsync<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof IntegrationRepositoryError) {
            throw error;
        }
        throw new IntegrationRepositoryContractError();
    }
}

function parseTimeout(value: number): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new RangeError("Integration repository timeout must be a positive integer");
    }
    return value;
}

async function assertResponseStatus(response: Response): Promise<void> {
    if (response.ok) {
        return;
    }
    await cancelResponse(response);
    if (response.status === 429 || response.status >= 500) {
        throw new IntegrationRepositoryUnavailableError();
    }
    throw new IntegrationRepositoryContractError();
}

function normalizedBaseUrl(value: string): URL {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new TypeError("Integration repository base URL is invalid");
    }
    url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return url;
}

function repositoryUrl(baseUrl: URL, path: string): URL {
    const url = new URL(path.replace(/^\/+/, ""), baseUrl);
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname) || url.hash) {
        throw new TypeError("Integration repository endpoint must remain within its configured origin and path");
    }
    return url;
}

function requestHeaders(headers: HeadersInit | undefined): Headers {
    const result = new Headers(headers);
    if (!result.has("accept")) {
        result.set("accept", "application/json");
    }
    return result;
}

async function assertResponseLocation(response: Response, baseUrl: URL): Promise<void> {
    if (!response.url) {
        return;
    }
    let url: URL;
    try {
        url = new URL(response.url);
    } catch {
        await cancelResponse(response);
        throw new IntegrationRepositoryContractError();
    }
    if (
        url.origin !== baseUrl.origin ||
        !url.pathname.startsWith(baseUrl.pathname) ||
        url.username ||
        url.password ||
        url.hash
    ) {
        await cancelResponse(response);
        throw new IntegrationRepositoryContractError();
    }
}

async function cancelResponse(response: Response): Promise<void> {
    await response.body?.cancel().catch(() => undefined);
}
