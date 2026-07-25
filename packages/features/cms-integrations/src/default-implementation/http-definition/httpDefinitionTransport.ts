import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    IntegrationRepositoryUnavailableError,
} from "../../core/errors";
import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";
import { responseAsset } from "./httpDefinitionAssets";

export const DEFAULT_INTEGRATION_REPOSITORY_TIMEOUT_MS = 10_000;

type HttpDefinitionTransportConfig = {
    baseUrl: string;
    fetch?: typeof fetch;
    headers?: HeadersInit;
    timeoutMs: number;
};

export class HttpDefinitionTransport {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly config: HttpDefinitionTransportConfig) {
        this.fetchImpl = config.fetch ?? fetch;
        this.timeoutMs = parseTimeout(config.timeoutMs);
    }

    async getJson(path: string): Promise<unknown> {
        const response = await this.fetchPath(path);
        assertResponseStatus(response);
        return await responseJson(response);
    }

    async getJsonOrNull(path: string): Promise<unknown | null> {
        const response = await this.fetchPath(path);
        if (response.status === 404) {
            return null;
        }
        assertResponseStatus(response);
        return await responseJson(response);
    }

    async getAsset(path: string, maxBytes?: number): Promise<IntegrationAsset | null> {
        const response = await this.fetchPath(path);
        if (response.status === 404) {
            return null;
        }
        assertResponseStatus(response);
        return await parseRepositoryContractAsync(() => responseAsset(response, maxBytes));
    }

    private async fetchPath(path: string): Promise<Response> {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutResult = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new IntegrationRepositoryUnavailableError());
            }, this.timeoutMs);
        });
        try {
            return await Promise.race([
                this.fetchImpl(repositoryUrl(this.config.baseUrl, path), {
                    headers: requestHeaders(this.config.headers),
                    signal: controller.signal,
                }),
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

function assertResponseStatus(response: Response): void {
    if (response.ok) {
        return;
    }
    if (response.status === 429 || response.status >= 500) {
        throw new IntegrationRepositoryUnavailableError();
    }
    throw new IntegrationRepositoryContractError();
}

async function responseJson(response: Response): Promise<unknown> {
    return await parseRepositoryContractAsync(() => response.json());
}

function normalizedBaseUrl(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function repositoryUrl(baseUrl: string, path: string): URL {
    return new URL(path.replace(/^\/+/, ""), normalizedBaseUrl(baseUrl));
}

function requestHeaders(headers: HeadersInit | undefined): Headers {
    const result = new Headers(headers);
    if (!result.has("accept")) {
        result.set("accept", "application/json");
    }
    return result;
}
