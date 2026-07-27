import { computeIntegrationPackageDigest, type IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { ExactDependencyPackage } from "../../src";

export function dependencyCandidatePackage(sql?: string): IntegrationPackageEnvelopeV1 {
    const dependencies = [{ name: "Foundation", kind: "foundation", versionRange: "^1.0.0" }];
    return sql
        ? sqlConnectorPackage("candidate", "1.1.0", dependencies, sql)
        : definitionOnlyPackage("candidate", "1.1.0", dependencies);
}

export function dependencySqlPackage(
    version: string,
    value: string,
    sql = [
        "create schema dependency_order;",
        "create table dependency_order.probe (value text primary key);",
        `insert into dependency_order.probe (value) values ('${value}');`,
    ].join("\n"),
): IntegrationPackageEnvelopeV1 {
    return sqlConnectorPackage("foundation", version, [], sql);
}

export async function exactDependencyPackage(
    envelope: IntegrationPackageEnvelopeV1,
    selection: "minimum" | "stable",
): Promise<ExactDependencyPackage> {
    return {
        selection,
        kind: envelope.kind,
        version: envelope.version,
        packageDigest: await computeIntegrationPackageDigest(envelope),
        envelope,
    };
}

function sqlConnectorPackage(
    kind: string,
    version: string,
    dependencies: readonly Readonly<{ name: string; kind: string; versionRange: string }>[],
    sql: string,
): IntegrationPackageEnvelopeV1 {
    const envelope = definitionOnlyPackage(kind, version, dependencies);
    return {
        ...envelope,
        files: {
            ...envelope.files,
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind,
                    label: kind,
                    version,
                    inputs: [],
                    ...(dependencies.length ? { dependencies } : {}),
                    connectors: [
                        {
                            provider: "supabase",
                            root: "connectors/supabase",
                            schemas: [{ manifest: "sql/schema.manifest.json" }],
                        },
                    ],
                }),
            },
            "connectors/supabase/sql/schema.manifest.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    schema: "cms.integration.sql-bundle.v1",
                    transaction: "atomic",
                    entries: [{ file: "schema.sql" }],
                }),
            },
            "connectors/supabase/sql/schema.sql": { encoding: "utf8", content: sql },
        },
    };
}

function definitionOnlyPackage(
    kind: string,
    version: string,
    dependencies: readonly Readonly<{ name: string; kind: string; versionRange: string }>[] = [],
): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind,
        version,
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": {
                encoding: "utf8",
                content: JSON.stringify({
                    kind,
                    label: kind,
                    version,
                    inputs: [],
                    ...(dependencies.length ? { dependencies } : {}),
                }),
            },
            "release-notes.md": { encoding: "utf8", content: `${kind} ${version}` },
        },
    };
}
