import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductionRepositoryManagementAccess } from "../../../src/repositoryManagement/composition";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("repository management production composition", () => {
    test("keeps the capability absent for an ordinary CMS", async () => {
        expect(await createProductionRepositoryManagementAccess(undefined)).toBeUndefined();
    });

    test("reads the server-side token and injects the configured administrator identity", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-repository-management-composition-"));
        roots.push(root);
        const tokenFile = join(root, "token");
        await writeFile(tokenFile, "private-service-token", { mode: 0o600 });
        const fetchImpl = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer private-service-token");
            return Response.json({
                ready: true,
                health: "healthy",
                integrations: 14,
                versions: 14,
                diagnostics: 0,
                quarantined: 0,
                recoveryDiagnostics: 0,
            });
        });

        const access = await createProductionRepositoryManagementAccess(
            {
                url: "http://cms-repository:3000/.cms/repository-management",
                tokenFile,
                administratorSubjectIdentifier: "opaque-admin-subject",
                timeoutMs: 5_000,
            },
            fetchImpl as unknown as typeof fetch,
        );

        expect(access?.administratorSubjectIdentifier).toBe("opaque-admin-subject");
        expect(await access?.gateway?.status()).toHaveProperty("status", 200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
