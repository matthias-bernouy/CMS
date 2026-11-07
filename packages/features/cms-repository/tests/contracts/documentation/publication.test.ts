import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { LocalContractReleases } from "cms-repository/repository/filesystem/contracts";
import { LocalArtifactFiles } from "cms-repository/repository/filesystem/artifacts/files";
import { RemoteRepositoryClient } from "cms-repository/repository/publication/client";
import { loadDocumentedContract } from "cms-repository/providers/sources/documentation/load";
import { HttpProviderRepository } from "cms-repository/providers/sources/http";
import { ownerFixture } from "../../repository-http/publicationFixtures";
import { documented } from "./fixtures";

test("account-authorized publication, immutable HTTP reads, pull and Provider import preserve documentation bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "contract-documentation-"));
    const f = await documented("# Send a message\n\nExact published bytes.\n", {
        publisherId: "publisher",
        contractId: "publisher/communication.email",
    });
    const { application, credential } = await ownerFixture(root);
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: application.handle });
    try {
        const client = new RemoteRepositoryClient(
            server.url.href,
            { ...credential, origin: server.url.origin },
            { allowInsecureHttp: true },
        );
        const envelope = {
            kind: "contract" as const,
            canonicalJson: f.admission.canonicalJson,
            assets: [{ id: "docs/guides/send.md", bytes: f.bytes }],
        };
        expect((await client.push(envelope)).digest).toBe(f.admission.digest);
        const coordinate = {
            kind: "contract" as const,
            publisherId: "publisher",
            id: f.admission.release.contractId,
            version: f.admission.release.version,
        };
        const url = new URL(
            `/.cms/call/ulvia/repository/v1/assets/contract/publisher/${encodeURIComponent(coordinate.id)}/${coordinate.version}/${encodeURIComponent("docs/guides/send.md")}`,
            server.url,
        );
        const response = await fetch(url);
        expect(response.headers.get("etag")).toBe(`"${f.document.digest}"`);
        expect(response.headers.get("content-type")).toContain("application/octet-stream");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(f.bytes);
        const head = await fetch(url, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(Number(head.headers.get("content-length"))).toBe(f.bytes.byteLength);
        expect(
            (
                await fetch(
                    new URL(
                        `/.cms/call/ulvia/repository/v1/assets/contract/publisher/${encodeURIComponent(coordinate.id)}/${coordinate.version}/${encodeURIComponent("docs/../private.md")}`,
                        server.url,
                    ),
                )
            ).status,
        ).toBe(404);
        const pulled = await client.pull(coordinate);
        expect((await admitContractBundleJson(pulled.canonicalJson, pulled.assets)).digest).toBe(f.admission.digest);
        const source = new HttpProviderRepository("official", server.url.href, { allowInsecureHttp: true });
        const imported = await loadDocumentedContract(source, { ...coordinate, digest: f.admission.digest });
        expect(await imported.documentationAssets?.[0]?.bytes.text()).toBe(new TextDecoder().decode(f.bytes));
        let downloads = 0;
        await expect(
            loadDocumentedContract(
                {
                    ...source,
                    id: "invalid",
                    list: async () => [],
                    get: async () => f.bytes,
                    getAsset: async () => {
                        downloads++;
                        return f.bytes;
                    },
                },
                { ...coordinate, digest: f.admission.digest },
                new TextEncoder().encode(f.admission.canonicalJson.replace("Email", "Tampered")),
            ),
        ).rejects.toThrow("digest mismatch");
        expect(downloads).toBe(0);
        const restarted = new LocalContractReleases(new LocalArtifactFiles(root));
        expect(
            await (
                await restarted.getDocumentation("publisher", coordinate.id, coordinate.version, "guides/send.md")
            )?.bytes.text(),
        ).toBe(new TextDecoder().decode(f.bytes));
    } finally {
        server.stop(true);
        await application.close();
        await rm(root, { recursive: true, force: true });
    }
});
