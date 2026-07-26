export class FakeSupabaseManagementApi {
    readonly functions = new Map<string, string>();
    revision = 1;
    migrationRuntimeSchemaReady = false;

    readonly fetch: typeof fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/database/query")) {
            return this.databaseResponse(String(init?.body));
        }
        const slug = url.searchParams.get("slug") ?? url.pathname.split("/").at(-1)!;
        if (url.pathname.endsWith("/functions/deploy")) {
            this.functions.set(slug, `bundle-${slug}`);
        }
        const bundleDigest = this.functions.get(slug);
        return bundleDigest
            ? Response.json({ slug, status: "ACTIVE", ezbr_sha256: bundleDigest })
            : Response.json({}, { status: 404 });
    };

    private databaseResponse(body: string): Response {
        const query = (JSON.parse(body) as { query: string }).query;
        if (query.includes("AS migration_runtime_schema_ready")) {
            return Response.json([{ migration_runtime_schema_ready: this.migrationRuntimeSchemaReady }]);
        }
        if (query.includes("CREATE TABLE IF NOT EXISTS cms_integration_runtime.migration_fences")) {
            this.migrationRuntimeSchemaReady = true;
        }
        const expectedRevision = query.match(/instance\.migration_revision >= (\d+)/)?.[1];
        if (expectedRevision) {
            const migrations = [...query.matchAll(/\('([^']+)', 'sha256:[a-f0-9]+'\)/g)].length;
            return Response.json(
                [{ migration_revision: Number(expectedRevision), matching_migrations: migrations }].filter(
                    (row) => row.migration_revision === this.revision,
                ),
            );
        }
        const revision = [...query.matchAll(/GREATEST\(migration_revision, (\d+)\)/g)].at(-1)?.[1];
        if (revision) {
            this.revision = Number(revision);
        }
        return Response.json([]);
    }
}
