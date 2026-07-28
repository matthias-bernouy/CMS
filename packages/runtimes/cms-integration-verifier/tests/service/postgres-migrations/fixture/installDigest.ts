import { computeSupabaseInstallDigest } from "@bernouy/cms-integrations/supabase";

export async function fixtureInstallDigest(sql: string): Promise<`sha256:${string}`> {
    const source = "schema.sql";
    return await computeSupabaseInstallDigest([
        {
            id: "install/schema.manifest.json",
            kind: "bundle",
            sourceFiles: [source],
            sql: `BEGIN;\n-- cms-integration-sql-source: ${source}\n${sql}${sql.endsWith("\n") ? "" : "\n"}-- cms-integration-sql-source-end: ${source}\nCOMMIT;\n`,
        },
    ]);
}
