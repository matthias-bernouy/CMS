import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsEnvSecretStore } from "cms-cli/dev-server/secrets";

describe("LocalFsEnvSecretStore", () => {
    test("writes secrets to site/.env and reads them back", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-secrets-"));
        const store = LocalFsEnvSecretStore.forSite(siteDir);

        await store.set("SUPABASE_MY_DB_API_KEY", "service-role-key");

        expect(await store.get("SUPABASE_MY_DB_API_KEY")).toBe("service-role-key");
        expect(await readFile(join(siteDir, ".env"), "utf-8")).toBe('SUPABASE_MY_DB_API_KEY="service-role-key"\n');
    });

    test("preserves unrelated env lines while updating and deleting a secret", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-secrets-"));
        const envPath = join(siteDir, ".env");
        await writeFile(envPath, "P9R_URL=http://localhost:5000\n# local notes\nSUPABASE_KEY=old\n", "utf-8");
        const store = LocalFsEnvSecretStore.forSite(siteDir);

        await store.set("SUPABASE_KEY", "new key");
        expect(await readFile(envPath, "utf-8")).toBe(
            'P9R_URL=http://localhost:5000\n# local notes\nSUPABASE_KEY="new key"\n',
        );

        await store.delete("SUPABASE_KEY");
        expect(await readFile(envPath, "utf-8")).toBe("P9R_URL=http://localhost:5000\n# local notes\n");
    });

    test("reads quoted values and ignores keys that cannot be referenced as secrets", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-secrets-"));
        await writeFile(
            join(siteDir, ".env"),
            [
                'SUPABASE_KEY="service role #1"',
                "OTHER_KEY='single quoted'",
                "lowercase=value",
                "BAD-DASH=value",
                "",
            ].join("\n"),
            "utf-8",
        );
        const store = LocalFsEnvSecretStore.forSite(siteDir);

        expect(await store.get("SUPABASE_KEY")).toBe("service role #1");
        expect(await store.get("OTHER_KEY")).toBe("single quoted");
        expect(await store.listKeys()).toEqual(["SUPABASE_KEY", "OTHER_KEY"]);
    });

    test("creates site/.env lazily on first write", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-secrets-"));
        const envPath = join(siteDir, ".env");
        const store = LocalFsEnvSecretStore.forSite(siteDir);

        expect(existsSync(envPath)).toBe(false);
        await store.set("API_KEY", "x");

        expect(existsSync(envPath)).toBe(true);
        expect(await store.list()).toEqual([{ key: "API_KEY", value: "x" }]);
    });

    test("restricts an existing site/.env to the owner after every write", async () => {
        const siteDir = mkdtempSync(join(tmpdir(), "p9r-secrets-"));
        const envPath = join(siteDir, ".env");
        await writeFile(envPath, "EXISTING=value\n", "utf-8");
        await chmod(envPath, 0o644);
        const store = LocalFsEnvSecretStore.forSite(siteDir);

        await store.set("SUPABASE_CONNECTOR_ACCESS_TOKEN", "sensitive-token");

        expect((await stat(envPath)).mode & 0o777).toBe(0o600);
    });
});
