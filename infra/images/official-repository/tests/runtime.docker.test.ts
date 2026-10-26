import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { RepositoryNamespaceClient } from "@bernouy/cms-repository/repository/namespaces";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { docker, repositoryContainer } from "./docker";

const image = process.env.ULVIA_REPOSITORY_DOCKER_IMAGE;

test.skipIf(!image)(
    "real image preserves ownership, owner publication and HTTP-only transport across graceful and abrupt restart",
    async () => {
        const keys = generateKeyPairSync("ed25519");
        const publicKey = keys.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
        const container = await repositoryContainer(image!);
        try {
            await container.start();
            let base = await container.ready();
            const namespace = new RepositoryNamespaceClient(base);
            const repositoryId = await namespace.identity();
            const credential = {
                namespace: "ulvia.official",
                repositoryId,
                revision: 0,
                resolvePrivateKey: async () => keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
            };
            await namespace.claim(credential, publicKey);
            await namespace.claim({ ...credential, namespace: "claim", revision: 0 }, publicKey);
            const canonicalJson = JSON.stringify({
                kind: "contract",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                contractId: "docker.example",
                version: "1.0.0",
                publisherId: "ulvia.official",
                name: "Docker contract",
                capabilities: [
                    {
                        id: "ping",
                        access: "public",
                        behavior: { effect: "query", execution: "sync" },
                        input: { type: "object", properties: {}, required: [] },
                        output: { type: "null" },
                        errors: [],
                        bindings: [
                            {
                                id: "http",
                                transport: "http",
                                method: "GET",
                                path: "/ping",
                                response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                            },
                        ],
                    },
                ],
            });
            const published = await new RemoteRepositoryClient(base, { ...credential, revision: 1 }).push({
                kind: "contract",
                canonicalJson,
                assets: [],
            });
            expect(published.added).toBe(true);
            expect((await fetch(`${base}mcp`, { method: "POST", body: "{}" })).status).toBe(404);
            const coordinate = {
                kind: "contract" as const,
                publisherId: "ulvia.official",
                id: "docker.example",
                version: "1.0.0",
            };
            const missing = await fetch(`${base}v1/releases/contract/claim/missing/1.0.0`, { method: "HEAD" });
            expect(missing.status).toBe(404);
            expect(missing.headers.get("x-ulvia-error-code")).toBe("NOT_FOUND");
            expect(await container.contend()).not.toBe(0);
            const pid = async () =>
                Number(
                    (
                        await docker([
                            "exec",
                            container.name,
                            "bun",
                            "-e",
                            'const p=await Bun.file("/proc/1/task/1/children").text(); process.stdout.write(p.trim());',
                        ])
                    ).stdout.trim(),
                );
            const originalPid = await pid();
            expect(originalPid).toBeGreaterThan(0);
            for (const signal of ["TERM", "KILL"]) {
                await docker(["kill", `--signal=${signal}`, container.name]);
                expect((await docker(["wait", container.name])).stdout.trim()).toMatch(/^\d+$/u);
                await docker(["start", container.name]);
                base = await container.ready();
                expect(await pid()).toBe(originalPid);
                const restarted = new RepositoryNamespaceClient(base);
                expect(await restarted.identity()).toBe(repositoryId);
                expect((await restarted.get("ulvia.official"))?.revision).toBe(1);
                expect((await new RemoteRepositoryClient(base).pull(coordinate)).expectedDigest).toBe(published.digest);
            }
        } finally {
            await container.close();
        }
    },
    60_000,
);
