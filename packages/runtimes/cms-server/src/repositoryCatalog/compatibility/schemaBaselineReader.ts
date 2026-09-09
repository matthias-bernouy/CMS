import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { parseConnectorSchemaContract, IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type { PublicRepositorySchemaBaseline, RepositorySchemaBaselineReader } from "@bernouy/cms-repository";
import { RepositoryCatalogHttpTransport } from "../transport";

const SHA256 = /^[a-f0-9]{64}$/u;
const PROVIDER = /^[a-z][a-z0-9-]{0,63}$/u;

export type HttpRepositorySchemaBaselineReaderConfig = Readonly<{
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxResponseBytes?: number;
}>;

export class HttpRepositorySchemaBaselineReader implements RepositorySchemaBaselineReader {
    private readonly transport: RepositoryCatalogHttpTransport;
    private readonly maxResponseBytes: number;

    constructor(config: HttpRepositorySchemaBaselineReaderConfig) {
        this.transport = new RepositoryCatalogHttpTransport({
            baseUrl: config.baseUrl,
            ...(config.fetch ? { fetch: config.fetch } : {}),
            timeoutMs: config.timeoutMs ?? 10_000,
        });
        this.maxResponseBytes = positiveLimit(config.maxResponseBytes ?? 1_048_576);
    }

    async listForPackage(
        kind: string,
        version: string,
        packageDigest: string,
    ): Promise<readonly PublicRepositorySchemaBaseline[]> {
        const target = validatedTarget(kind, version, packageDigest);
        const query = new URLSearchParams(target);
        const document = await this.transport.getJson(
            `api/integrations/schema-baselines?${query.toString()}`,
            this.maxResponseBytes,
        );
        if (!document) {
            throw new IntegrationRepositoryContractError();
        }
        return parseBaselines(document.value, target);
    }
}

function parseBaselines(
    value: unknown,
    target: Readonly<{ kind: string; version: string; packageDigest: string }>,
): readonly PublicRepositorySchemaBaseline[] {
    if (!Array.isArray(value)) {
        throw new IntegrationRepositoryContractError();
    }
    const connectors = new Set<string>();
    try {
        return Object.freeze(
            value.map((entry) => {
                const input = exactRecord(entry, [
                    "connector",
                    "packageDigest",
                    "dependencies",
                    "schema",
                    "provenance",
                ]);
                const connector = parseConnector(input.connector);
                const packageDigest = digest(input.packageDigest);
                if (packageDigest !== target.packageDigest) {
                    throw new IntegrationRepositoryContractError();
                }
                const connectorIdentity = `${connector.provider}:${connector.root ?? ""}`;
                if (connectors.has(connectorIdentity)) {
                    throw new IntegrationRepositoryContractError();
                }
                connectors.add(connectorIdentity);
                return Object.freeze({
                    connector,
                    packageDigest,
                    dependencies: parseDependencies(input.dependencies),
                    schema: parseConnectorSchemaContract(input.schema, connector.provider, "reviewed schema baseline"),
                    provenance: parseProvenance(input.provenance),
                });
            }),
        );
    } catch (error) {
        if (error instanceof IntegrationRepositoryContractError) {
            throw error;
        }
        throw new IntegrationRepositoryContractError();
    }
}

function parseConnector(value: unknown): PublicRepositorySchemaBaseline["connector"] {
    const input = exactRecord(value, ["provider", "root"]);
    const provider = text(input.provider, 64);
    if (!PROVIDER.test(provider)) {
        throw new IntegrationRepositoryContractError();
    }
    return Object.freeze({ provider, ...(input.root === undefined ? {} : { root: text(input.root, 4_096) }) });
}

function parseDependencies(value: unknown): PublicRepositorySchemaBaseline["dependencies"] {
    if (!Array.isArray(value)) {
        throw new IntegrationRepositoryContractError();
    }
    return Object.freeze(
        value.map((entry) => {
            const input = exactRecord(entry, ["kind", "version", "packageDigest"]);
            return Object.freeze({
                kind: assertIntegrationPackageKind(input.kind),
                version: assertIntegrationPackageVersion(input.version),
                packageDigest: digest(input.packageDigest),
            });
        }),
    );
}

function parseProvenance(value: unknown): PublicRepositorySchemaBaseline["provenance"] {
    const input = exactRecord(value, ["evidenceId", "source", "reviewedAt"]);
    const reviewedAt = text(input.reviewedAt, 128);
    if (!Number.isFinite(Date.parse(reviewedAt))) {
        throw new IntegrationRepositoryContractError();
    }
    return Object.freeze({
        evidenceId: text(input.evidenceId, 512),
        source: text(input.source, 512),
        reviewedAt,
    });
}

function validatedTarget(kind: string, version: string, packageDigest: string) {
    try {
        return {
            kind: assertIntegrationPackageKind(kind),
            version: assertIntegrationPackageVersion(version),
            packageDigest: digest(packageDigest),
        };
    } catch {
        throw new IntegrationRepositoryContractError();
    }
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new IntegrationRepositoryContractError();
    }
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !keys.includes(key))) {
        throw new IntegrationRepositoryContractError();
    }
    return input;
}

function text(value: unknown, maxLength: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
        throw new IntegrationRepositoryContractError();
    }
    return value;
}

function digest(value: unknown): string {
    if (typeof value !== "string" || !SHA256.test(value)) {
        throw new IntegrationRepositoryContractError();
    }
    return value;
}

function positiveLimit(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError("Schema baseline response limit must be a positive safe integer");
    }
    return value;
}
