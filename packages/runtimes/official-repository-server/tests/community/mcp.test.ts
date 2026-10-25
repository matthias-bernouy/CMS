import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { communityFixture, capabilityProof, simpleContract } from "./fixtures";

test("Repository MCP and admitted HTTP bindings invoke the same staged publication service", async () => {
    const f = await communityFixture();
    try {
        const mcp = async (capability: string, input: unknown) => {
            const response = await fetch(`${f.base}mcp`, {
                method: "POST",
                headers: {
                    Accept: "application/json, text/event-stream",
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": "2025-11-25",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/call",
                    params: { name: capabilityToolName("ulvia.repository", capability), arguments: { input } },
                }),
            });
            return (await response.json()) as {
                result?: { structuredContent?: { output?: Record<string, unknown> }; isError?: boolean };
                error?: unknown;
            };
        };
        expect((await mcp("repository-info", {})).result?.structuredContent?.output?.repositoryId).toBe(
            f.credential.repositoryId,
        );
        const manifest = { kind: "contract", canonicalJson: simpleContract(), assets: [] };
        const begin = await mcp("publication-begin", {
            namespace: "community",
            manifest: JSON.stringify({ protocol: "ulvia-repository-upload/v1", ...manifest }),
            proof: capabilityProof(f.credential, f.key.privateKey, "publication-begin", "community", manifest),
        });
        expect(begin.error).toBeUndefined();
        const uploadId = begin.result?.structuredContent?.output?.uploadId as string;
        expect(uploadId).toBeString();
        const input = {
            namespace: "community",
            uploadId,
            proof: capabilityProof(f.credential, f.key.privateKey, "publication-commit", uploadId, { uploadId }),
        };
        const committed = await fetch(`${f.base}v1/uploads/commit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        expect(committed.status).toBe(200);
        const first = await committed.json();
        const retry = await mcp("publication-commit", input);
        expect(retry.result?.structuredContent?.output).toEqual(first);
        const writer = new RemoteRepositoryClient(f.base, f.credential);
        expect(
            (
                await writer.pull({
                    kind: "contract",
                    publisherId: "community",
                    id: "community.example",
                    version: "1.0.0",
                })
            ).expectedDigest,
        ).toBe((first as { digest: string }).digest);
        const resource = await mcp("release-download", {
            kind: "contract",
            publisherId: "community",
            id: "community.example",
            version: "1.0.0",
        });
        expect(resource.result?.structuredContent?.output?.uri).toBe(
            `${f.base}v1/contracts/community/community.example/1.0.0`,
        );
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});
