import { decodeIntegrationPackageFile, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { lintAnonymousConstraints } from "@bernouy/cms-integrations/supabase";

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function assertPackageAnonymousConstraintPolicy(integrationPackage: ResolvedIntegrationPackage): void {
    const sqlPaths = Object.keys(integrationPackage.envelope.files)
        .filter((path) => path.endsWith(".sql"))
        .sort(compareText);
    for (const path of sqlPaths) {
        const file = integrationPackage.envelope.files[path]!;
        let sql: string;
        try {
            sql = utf8.decode(decodeIntegrationPackageFile(file));
        } catch (error) {
            throw new TypeError(`Integration SQL file must be valid UTF-8 for constraint lint: ${path}`, {
                cause: error,
            });
        }
        const actual = lintAnonymousConstraints(sql, path);
        if (actual.length > 0) {
            throw new TypeError(`Integration SQL requires explicitly named CHECK and UNIQUE constraints: ${path}`);
        }
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
