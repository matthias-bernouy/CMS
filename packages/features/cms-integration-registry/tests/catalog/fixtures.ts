import type {
    IntegrationRegistryCatalogDiagnostic,
    IntegrationRegistryValidatedCatalogEntry,
} from "@bernouy/cms-integration-registry";

export function catalogEntry(kind: string, version = "1.0.0"): IntegrationRegistryValidatedCatalogEntry {
    return {
        source: `/registry/${kind}`,
        index: {
            kind,
            label: kind,
            stable: version,
            latest: version,
            versions: [
                {
                    version,
                    path: `versions/${version}`,
                    definition: `versions/${version}/definition.json`,
                },
            ],
        },
        versions: [
            {
                kind,
                version,
                integrationRoot: `/registry/${kind}`,
                packageRoot: `/registry/${kind}/versions/${version}`,
                definition: "definition.json",
                definitionSnapshot: {
                    kind,
                    label: kind,
                    version,
                    inputs: [],
                },
                releaseNotes: "README.md",
                package: {
                    schema: "cms.integration.package.v1",
                    digest: "a".repeat(64),
                    canonicalBytes: 100,
                    decodedBytes: 50,
                    files: 2,
                },
            },
        ],
    };
}

export function diagnostic(source: string): IntegrationRegistryCatalogDiagnostic {
    return {
        code: "invalid-integration",
        stage: "index",
        source,
        message: "invalid test integration",
    };
}
