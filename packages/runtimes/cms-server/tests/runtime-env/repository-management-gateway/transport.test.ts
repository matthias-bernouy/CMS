import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositoryManagementUpstreamToken } from "../../../src/runtime/repository/credentials";
import { HttpRepositoryManagementGateway } from "../../../src/runtime/repository";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("repository management CMS gateway transport", () => {
    test("reads a bounded regular upstream credential without following symlinks", async () => {
        const root = await temporaryRoot();
        const token = join(root, "token");
        const link = join(root, "link");
        await writeFile(token, "internal-secret", { mode: 0o600 });
        await symlink(token, link);

        expect(await readRepositoryManagementUpstreamToken(token)).toBe("internal-secret");
        await expect(readRepositoryManagementUpstreamToken(link)).rejects.toThrow("bounded regular secret file");
        await writeFile(token, "invalid token", { mode: 0o600 });
        await expect(readRepositoryManagementUpstreamToken(token)).rejects.toThrow("bounded regular secret file");
    });

    test("replaces the CMS PAT with the internal token and preserves the allowlisted request", async () => {
        let captured: Request | undefined;
        const gateway = new HttpRepositoryManagementGateway({
            baseUrl: "http://cms-repository:3000/.cms/repository-management",
            token: "internal-secret",
            timeoutMs: 1_000,
            fetch: async (input, init) => {
                captured = new Request(input, init);
                return Response.json({ accepted: true }, { status: 202 });
            },
        });
        const body = new TextEncoder().encode('{"candidate":true}');

        const response = await gateway.forward({
            actor: "local:admin@example.test",
            method: "POST",
            path: "/api/integrations/candidates",
            query: "?dryRun=false",
            contentType: "application/json",
            body,
        });

        expect(response.status).toBe(202);
        expect(captured?.url).toBe(
            "http://cms-repository:3000/.cms/repository-management/api/integrations/candidates?dryRun=false",
        );
        expect(captured?.headers.get("authorization")).toBe("Bearer internal-secret");
        expect(captured?.headers.get("x-p9r-authenticated-actor")).toBe("local%3Aadmin%40example.test");
        expect(await captured?.text()).toBe('{"candidate":true}');
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-repository-management-gateway-"));
    roots.push(root);
    return root;
}
