import type { IntegrationPackageLimits } from "../../interfaces/envelope";
import type {
    IntegrationPackageSource,
    ResolvedIntegrationPackage,
    ResolvedIntegrationPackageMetadata,
} from "../../interfaces/source";
import { canonicalJsonBytes } from "../../core/canonical/canonicalizeJson";
import { sha256Hex } from "../../core/digest";
import { resolveIntegrationPackageLimits } from "../../core/envelope/constants";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "../../core/envelope/identity";
import { parseIntegrationPackageEnvelope } from "../../core/envelope/validate";
import {
    IntegrationPackageRepositoryContractError,
    IntegrationPackageRepositoryError,
    IntegrationPackageRepositoryUnavailableError,
} from "./errors";
import {
    assertMatchingPackageMetadata,
    integrationPackageResponseMetadata,
    readIntegrationPackageResponse,
    type IntegrationPackageResponseMetadata,
} from "./response";
import {
    assertSuccessfulPackageStatus,
    equalBytes,
    integrationPackageEndpoint,
    parsePackageTimeout,
} from "./sourceSupport";

export const DEFAULT_HTTP_INTEGRATION_PACKAGE_TIMEOUT_MS = 10_000;

export type HttpIntegrationPackageSourceConfig = {
    baseUrl: string;
    fetch?: typeof fetch;
    limits?: Partial<IntegrationPackageLimits>;
    timeoutMs?: number;
};

export class HttpIntegrationPackageSource implements IntegrationPackageSource {
    private readonly endpoint: URL;
    private readonly fetchImpl: typeof fetch;
    private readonly limits: Readonly<IntegrationPackageLimits>;
    private readonly timeoutMs: number;

    constructor(config: HttpIntegrationPackageSourceConfig) {
        this.endpoint = integrationPackageEndpoint(config.baseUrl);
        this.fetchImpl = config.fetch ?? fetch;
        this.limits = resolveIntegrationPackageLimits(config.limits);
        this.timeoutMs = parsePackageTimeout(config.timeoutMs ?? DEFAULT_HTTP_INTEGRATION_PACKAGE_TIMEOUT_MS);
    }

    async getPackage(kind: string, version: string): Promise<ResolvedIntegrationPackage | null> {
        const expectedKind = assertIntegrationPackageKind(kind);
        const expectedVersion = assertIntegrationPackageVersion(version);
        return await this.withTimeout((signal) => this.load(expectedKind, expectedVersion, signal));
    }

    async getPackageMetadata(kind: string, version: string): Promise<ResolvedIntegrationPackageMetadata | null> {
        const expectedKind = assertIntegrationPackageKind(kind);
        const expectedVersion = assertIntegrationPackageVersion(version);
        return await this.withTimeout((signal) => this.loadMetadata(expectedKind, expectedVersion, signal));
    }

    private async load(kind: string, version: string, signal: AbortSignal): Promise<ResolvedIntegrationPackage | null> {
        const headMetadata = await this.loadHead(kind, version, signal);
        if (!headMetadata) {
            return null;
        }
        const url = new URL(this.endpoint);
        url.search = new URLSearchParams({ kind, version }).toString();
        const response = await this.request(url, "GET", signal);
        assertSuccessfulPackageStatus(response);
        const getMetadata = integrationPackageResponseMetadata(response, this.limits.maxDocumentBytes);
        assertMatchingPackageMetadata(headMetadata, getMetadata);
        const bytes = await readIntegrationPackageResponse(response, this.limits.maxDocumentBytes, signal);
        return await this.resolve(bytes, getMetadata.digest, kind, version);
    }

    private async loadMetadata(
        kind: string,
        version: string,
        signal: AbortSignal,
    ): Promise<ResolvedIntegrationPackageMetadata | null> {
        const metadata = await this.loadHead(kind, version, signal);
        if (!metadata) {
            return null;
        }
        if (metadata.contentLength === undefined) {
            throw new IntegrationPackageRepositoryContractError();
        }
        return { kind, version, digest: metadata.digest, canonicalBytes: metadata.contentLength };
    }

    private async loadHead(
        kind: string,
        version: string,
        signal: AbortSignal,
    ): Promise<IntegrationPackageResponseMetadata | null> {
        const url = new URL(this.endpoint);
        url.search = new URLSearchParams({ kind, version }).toString();
        const response = await this.request(url, "HEAD", signal);
        if (response.status === 404) {
            return null;
        }
        assertSuccessfulPackageStatus(response);
        return integrationPackageResponseMetadata(response, this.limits.maxDocumentBytes);
    }

    private async request(url: URL, method: "GET" | "HEAD", signal: AbortSignal): Promise<Response> {
        return await this.fetchImpl(url, {
            method,
            headers: { accept: "application/json" },
            credentials: "omit",
            redirect: "manual",
            signal,
        });
    }

    private async resolve(
        bytes: Uint8Array,
        advertisedDigest: string,
        kind: string,
        version: string,
    ): Promise<ResolvedIntegrationPackage> {
        try {
            const envelope = parseIntegrationPackageEnvelope(bytes, { limits: this.limits });
            if (envelope.kind !== kind || envelope.version !== version) {
                throw new IntegrationPackageRepositoryContractError();
            }
            const canonicalBytes = canonicalJsonBytes(envelope);
            if (!equalBytes(bytes, canonicalBytes)) {
                throw new IntegrationPackageRepositoryContractError();
            }
            const digest = await sha256Hex(canonicalBytes);
            if (digest !== advertisedDigest) {
                throw new IntegrationPackageRepositoryContractError();
            }
            return { envelope, canonicalBytes, digest };
        } catch (error) {
            if (error instanceof IntegrationPackageRepositoryError) {
                throw error;
            }
            throw new IntegrationPackageRepositoryContractError();
        }
    }

    private async withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timeoutResult = new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
                controller.abort();
                reject(new IntegrationPackageRepositoryUnavailableError());
            }, this.timeoutMs);
        });
        try {
            return await Promise.race([operation(controller.signal), timeoutResult]);
        } catch (error) {
            if (error instanceof IntegrationPackageRepositoryError) {
                throw error;
            }
            throw new IntegrationPackageRepositoryUnavailableError();
        } finally {
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
        }
    }
}
