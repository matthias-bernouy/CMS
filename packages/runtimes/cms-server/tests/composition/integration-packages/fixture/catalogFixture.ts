import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export const REMOTE_INTEGRATION_KIND = "remote-only-process-acceptance";
export const REMOTE_INTEGRATION_VERSION = "9.8.7";
export const REMOTE_UPGRADE_VERSION = "9.9.0";
export const REMOTE_SQL_MARKER = "remote_only_process_acceptance";
export const REMOTE_FUNCTION_MARKER = "remote-only-function-from-package";
export const REMOTE_UPGRADE_MARKER = "remote-only-upgrade-from-package";

export const REMOTE_DEFINITION: IntegrationDefinition = {
    kind: REMOTE_INTEGRATION_KIND,
    label: "Remote-only process acceptance",
    version: REMOTE_INTEGRATION_VERSION,
    category: "Acceptance",
    description: "Exists only in the external repository fixture.",
    inputs: [],
    connectors: [
        {
            provider: "supabase",
            root: "connectors/supabase",
            dataApiSchemas: [],
            schemas: [{ path: "sql/schema.sql" }],
            functions: [
                {
                    name: "remote-only-function",
                    directory: "functions/remote-only-function",
                },
            ],
        },
    ],
};

export const REMOTE_UPGRADE_DEFINITION: IntegrationDefinition = {
    ...REMOTE_DEFINITION,
    version: REMOTE_UPGRADE_VERSION,
    description: "Upgraded remote-only acceptance package.",
};

export async function writeRemoteIntegrationCatalog(repositoryRoot: string): Promise<string> {
    const packageRoot = join(repositoryRoot, REMOTE_INTEGRATION_KIND);
    await mkdir(packageRoot, { recursive: true });
    await writeJson(join(packageRoot, "integration.json"), {
        schema: "cms.integration.index.v1",
        kind: REMOTE_INTEGRATION_KIND,
        label: REMOTE_DEFINITION.label,
        category: REMOTE_DEFINITION.category,
        description: REMOTE_DEFINITION.description,
        stable: REMOTE_INTEGRATION_VERSION,
        latest: REMOTE_UPGRADE_VERSION,
        versions: [REMOTE_INTEGRATION_VERSION, REMOTE_UPGRADE_VERSION].map((version) => ({
            version,
            path: `versions/${version}`,
            definition: `versions/${version}/definition.json`,
        })),
    });
    await Promise.all([
        writeVersion(packageRoot, REMOTE_DEFINITION, REMOTE_SQL_MARKER, REMOTE_FUNCTION_MARKER),
        writeVersion(packageRoot, REMOTE_UPGRADE_DEFINITION, `${REMOTE_SQL_MARKER}_upgrade`, REMOTE_UPGRADE_MARKER),
    ]);
    return join(packageRoot, "versions", REMOTE_INTEGRATION_VERSION);
}

async function writeVersion(
    packageRoot: string,
    definition: IntegrationDefinition,
    sqlMarker: string,
    functionMarker: string,
): Promise<void> {
    const versionRoot = join(packageRoot, "versions", definition.version!);
    const connectorRoot = join(versionRoot, "connectors", "supabase");
    await mkdir(join(connectorRoot, "sql"), { recursive: true });
    await mkdir(join(connectorRoot, "functions", "remote-only-function"), { recursive: true });
    await Promise.all([
        writeJson(join(versionRoot, "definition.json"), definition),
        writeFile(join(versionRoot, "README.md"), `# Remote-only ${definition.version}\n`, "utf8"),
        writeFile(join(connectorRoot, "sql", "schema.sql"), `create schema if not exists ${sqlMarker};\n`, "utf8"),
        writeFile(
            join(connectorRoot, "functions", "remote-only-function", "index.ts"),
            `export const marker = "${functionMarker}";\n`,
            "utf8",
        ),
    ]);
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
