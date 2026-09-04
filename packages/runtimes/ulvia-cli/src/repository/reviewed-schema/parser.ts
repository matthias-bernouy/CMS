import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { ReviewedConnectorSchemaBaseline } from "@bernouy/cms-integration-registry";
import { parseConnectorSchemaContract } from "@bernouy/cms-integrations";

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const PROVIDER = /^[a-z][a-z0-9-]{0,63}$/u;

export type ReviewedSchemaTarget = Readonly<{ kind: string; version: string; packageDigest: string }>;

export function parseReviewedSchemaBaselines(
    value: unknown,
    target: ReviewedSchemaTarget,
): readonly ReviewedConnectorSchemaBaseline[] {
    if (!Array.isArray(value)) {
        throw new Error("Reviewed schema baselines must be an array");
    }
    const connectors = new Set<string>();
    return Object.freeze(
        value.map((entry, index) => {
            const name = `reviewed schema baselines[${index}]`;
            const input = exactRecord(entry, name, [
                "connector",
                "packageDigest",
                "dependencies",
                "schema",
                "provenance",
            ]);
            const connector = parseConnector(input.connector, `${name}.connector`);
            const packageDigest = digest(input.packageDigest, `${name}.packageDigest`);
            if (packageDigest !== target.packageDigest) {
                throw new Error(`${name} does not belong to ${coordinate(target)}`);
            }
            const connectorIdentity = `${connector.provider}:${connector.root ?? ""}`;
            if (connectors.has(connectorIdentity)) {
                throw new Error(`${name} duplicates connector ${connectorIdentity}`);
            }
            connectors.add(connectorIdentity);
            return Object.freeze({
                connector,
                packageDigest,
                dependencies: parseDependencies(input.dependencies, `${name}.dependencies`),
                schema: parseConnectorSchemaContract(input.schema, connector.provider, `${name}.schema`),
                provenance: parseProvenance(input.provenance, `${name}.provenance`),
            });
        }),
    );
}

export function parseReviewedSchemaTarget(value: unknown, expected: ReviewedSchemaTarget): ReviewedSchemaTarget {
    const input = exactRecord(value, "reviewed schema target", ["kind", "version", "packageDigest"]);
    const target = Object.freeze({
        kind: assertIntegrationPackageKind(input.kind),
        version: assertIntegrationPackageVersion(input.version),
        packageDigest: digest(input.packageDigest, "reviewed schema target.packageDigest"),
    });
    if (coordinate(target) !== coordinate(expected) || target.packageDigest !== expected.packageDigest) {
        throw new Error(`Reviewed schema target does not match ${coordinate(expected)}`);
    }
    return target;
}

function parseConnector(value: unknown, name: string): ReviewedConnectorSchemaBaseline["connector"] {
    const input = exactRecord(value, name, ["provider", "root"]);
    const provider = text(input.provider, `${name}.provider`, 64);
    if (!PROVIDER.test(provider)) {
        throw new Error(`${name}.provider is invalid`);
    }
    return Object.freeze({
        provider,
        ...(input.root === undefined ? {} : { root: text(input.root, `${name}.root`, 4_096) }),
    });
}

function parseDependencies(value: unknown, name: string): ReviewedConnectorSchemaBaseline["dependencies"] {
    if (!Array.isArray(value)) {
        throw new Error(`${name} must be an array`);
    }
    return Object.freeze(
        value.map((entry, index) => {
            const input = exactRecord(entry, `${name}[${index}]`, ["kind", "version", "packageDigest"]);
            return Object.freeze({
                kind: assertIntegrationPackageKind(input.kind),
                version: assertIntegrationPackageVersion(input.version),
                packageDigest: digest(input.packageDigest, `${name}[${index}].packageDigest`),
            });
        }),
    );
}

function parseProvenance(value: unknown, name: string): ReviewedConnectorSchemaBaseline["provenance"] {
    const input = exactRecord(value, name, ["evidenceId", "source", "reviewedAt"]);
    const reviewedAt = text(input.reviewedAt, `${name}.reviewedAt`, 128);
    if (!Number.isFinite(Date.parse(reviewedAt))) {
        throw new Error(`${name}.reviewedAt must be a timestamp`);
    }
    return Object.freeze({
        evidenceId: text(input.evidenceId, `${name}.evidenceId`, 512),
        source: text(input.source, `${name}.source`, 512),
        reviewedAt,
    });
}

export function exactRecord(value: unknown, name: string, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${name} must be an object`);
    }
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !keys.includes(key))) {
        throw new Error(`${name} contains unknown fields`);
    }
    return input;
}

function text(value: unknown, name: string, maxLength: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
        throw new Error(`${name} is invalid`);
    }
    return value;
}

function digest(value: unknown, name: string): string {
    if (typeof value !== "string" || !SHA256_HEX.test(value)) {
        throw new Error(`${name} is not a SHA-256 digest`);
    }
    return value;
}

function coordinate(target: Pick<ReviewedSchemaTarget, "kind" | "version">): string {
    return `${target.kind}@${target.version}`;
}
