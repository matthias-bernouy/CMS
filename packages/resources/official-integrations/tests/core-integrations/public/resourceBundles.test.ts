import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { resolveIntegrationDefinitionFile } from "@bernouy/cms-integrations/fs";
import { loadSupabaseSqlBundle } from "@bernouy/cms-integrations/supabase";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import * as audit from "../../helpers/resourceBundleAudit";
type Bundle = { entry: string; versionRoot: string };
type ResolvedBundle = Bundle & { value: unknown };
type JsonObject = Record<string, unknown>;
type ResourceTree = Awaited<ReturnType<typeof audit.walkResourceTree>>;
const PACKAGE_ROOT = resolve(OFFICIAL_INTEGRATIONS_ROOT, "..");
test("official definition and SQL bundles remain complete and maintainable", async () => {
    const integrationTree = await audit.walkResourceTree(OFFICIAL_INTEGRATIONS_ROOT);
    const bundles = await discoverBundles(integrationTree.files);
    const definitionRoots = bundles.map(({ versionRoot }) => resolve(versionRoot, "definitions"));
    const definitionTrees = await Promise.all(definitionRoots.map(audit.walkResourceTree));
    const reachedDefinitions = new Set<string>();
    const resolvedBundles: ResolvedBundle[] = [];
    for (const bundle of bundles) {
        const entry = await audit.readJsonObject(bundle.entry);
        expect(entry.schema).toBe("cms.integration.definition.bundle.v1");
        const value = await resolveIntegrationDefinitionFile(bundle.entry, bundle.versionRoot);
        resolvedBundles.push({ ...bundle, value });
        for (const file of await audit.collectDefinitionFiles(bundle.entry)) {
            reachedDefinitions.add(file);
        }
    }
    const orphanDefinitions = definitionTrees
        .flatMap(({ files }) => files)
        .filter((file) => !reachedDefinitions.has(file))
        .map(show);
    const sqlRoots = sqlBundleRoots(integrationTree.files);
    const sqlTrees = await Promise.all(sqlRoots.map(audit.walkResourceTree));
    const rootManifests: string[] = [];
    const orphanManifests: string[] = [];
    const fragmentUses = new Map<string, number>();
    for (const sqlRoot of sqlRoots) {
        const graph = await audit.inspectSqlManifestGraph(sqlRoot);
        rootManifests.push(...graph.roots);
        orphanManifests.push(...graph.manifests.filter((file) => !graph.reachedManifests.includes(file)).map(show));
        for (const manifest of graph.roots) {
            const connectorRoot = supabaseConnectorRoot(sqlRoot);
            const loaded = await loadSupabaseSqlBundle(connectorRoot, audit.portableRelative(connectorRoot, manifest));
            for (const source of loaded.sourceFiles) {
                const file = resolve(dirname(manifest), source);
                fragmentUses.set(file, (fragmentUses.get(file) ?? 0) + 1);
            }
        }
    }
    const fragmentCoverage = sqlTrees
        .flatMap(({ files }) => files)
        .filter((file) => extname(file) === ".sql" && fragmentUses.get(file) !== 1)
        .map((file) => `${show(file)} (${fragmentUses.get(file) ?? 0})`);
    const { declaredManifests, legacySchemas } = declaredSchemas(resolvedBundles);
    const scopes = [
        ...definitionRoots.map((root, index) => ({ root, tree: definitionTrees[index]! })),
        ...sqlRoots.map((root, index) => ({ root, tree: sqlTrees[index]! })),
    ];
    const wideDirectories = scopes.flatMap(({ root, tree }) =>
        tree.wideDirectories.map((path) => `${show(root)}/${path}`),
    );
    const nonThematicPaths = scopes.flatMap(({ root, tree }) =>
        audit.nonThematicResourcePaths(root, tree).map((path) => `${show(root)}/${path}`),
    );
    const lineViolations = await oversizedBundleFiles(definitionTrees, sqlTrees);
    const legacyReferences = await findLegacyReferences((await audit.walkResourceTree(PACKAGE_ROOT)).files);
    expect(bundles).toHaveLength(22);
    expect(rootManifests).toHaveLength(15);
    expect(declaredManifests.map(show).sort()).toEqual(rootManifests.map(show).sort());
    const findings = [orphanDefinitions, orphanManifests, fragmentCoverage, legacySchemas, wideDirectories];
    findings.push(nonThematicPaths, lineViolations, legacyReferences);
    expect(findings.flat()).toEqual([]);
});
async function discoverBundles(files: string[]): Promise<Bundle[]> {
    const bundles: Bundle[] = [];
    for (const index of files.filter((file) => basename(file) === "integration.json")) {
        const versions = (await audit.readJsonObject(index)).versions as JsonObject[];
        for (const version of versions) {
            bundles.push({
                entry: resolve(dirname(index), String(version.definition)),
                versionRoot: resolve(dirname(index), String(version.path)),
            });
        }
    }
    return bundles;
}
function sqlBundleRoots(files: string[]): string[] {
    const markers = [
        `${sep}connectors${sep}supabase${sep}sql${sep}`,
        `${sep}connectors${sep}supabase${sep}install${sep}sql${sep}`,
    ];
    return [
        ...new Set(
            files.flatMap((file) =>
                markers.flatMap((marker) =>
                    file.includes(marker) ? [file.split(marker)[0] + marker.slice(0, -1)] : [],
                ),
            ),
        ),
    ];
}

function supabaseConnectorRoot(sqlRoot: string): string {
    const marker = `${sep}connectors${sep}supabase`;
    const index = sqlRoot.indexOf(marker);
    if (index < 0) {
        throw new Error(`SQL bundle root is outside a Supabase connector: ${sqlRoot}`);
    }
    return sqlRoot.slice(0, index + marker.length);
}
function declaredSchemas(bundles: ResolvedBundle[]): { declaredManifests: string[]; legacySchemas: string[] } {
    const declaredManifests: string[] = [];
    const legacySchemas: string[] = [];
    for (const bundle of bundles) {
        const connectors =
            isObject(bundle.value) && Array.isArray(bundle.value.connectors) ? bundle.value.connectors : [];
        for (const connector of connectors.filter(isObject)) {
            if (connector.provider !== "supabase" || typeof connector.root !== "string") {
                continue;
            }
            for (const schema of (Array.isArray(connector.schemas) ? connector.schemas : []).filter(isObject)) {
                if (Object.keys(schema).length === 1 && typeof schema.manifest === "string") {
                    declaredManifests.push(resolve(bundle.versionRoot, connector.root, schema.manifest));
                } else {
                    legacySchemas.push(`${show(bundle.entry)}:${JSON.stringify(schema)}`);
                }
            }
        }
    }
    return { declaredManifests, legacySchemas };
}
async function oversizedBundleFiles(definitions: ResourceTree[], sql: ResourceTree[]): Promise<string[]> {
    const violations: string[] = [];
    for (const file of [...definitions, ...sql].flatMap(({ files }) => files)) {
        const source = await readFile(file, "utf8");
        const lines = audit.physicalLineCount(source);
        if (lines > 180 && (extname(file) !== ".sql" || !audit.isCohesiveSqlException(source))) {
            violations.push(`${show(file)} (${lines})`);
        }
    }
    return violations;
}
async function findLegacyReferences(files: string[]): Promise<string[]> {
    const names = [["schema", "sql"].join("."), ["broadcast-schema", "sql"].join(".")];
    const pattern = new RegExp(`(?<![\\w-])(?:${names.join("|").replaceAll(".", "\\.")})(?![\\w.-])`, "u");
    const extensions = new Set([".json", ".sql", ".toml", ".ts"]);
    const candidates = files.filter((file) => !file.includes(`${sep}dist${sep}`) && extensions.has(extname(file)));
    const matches: string[] = [];
    for (const file of candidates) {
        if (names.includes(basename(file)) || pattern.test(await readFile(file, "utf8"))) {
            matches.push(show(file));
        }
    }
    return matches;
}
function show(file: string): string {
    return audit.portableRelative(PACKAGE_ROOT, file);
}
function isObject(value: unknown): value is JsonObject {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
