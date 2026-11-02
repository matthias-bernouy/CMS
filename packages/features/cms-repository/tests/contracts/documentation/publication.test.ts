import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitContractBundleJson } from "@bernouy/cms-repository/contracts";
import {
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    LocalContractReleases,
    LocalArtifactFiles,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint, RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { loadDocumentedContract } from "@bernouy/cms-repository/providers/sources";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { ownerFixture } from "../../repository-http/publicationFixtures";
import { documented } from "./fixtures";

test("signed publication, immutable HTTP reads, pull and Provider import preserve documentation bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "contract-documentation-"));
    const f = await documented("# Send a message\n\nExact published bytes.\n", { publisherId: "publisher" });
    const { namespaces, credential } = await ownerFixture(root);
    const mutation = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(root), {
        namespaces,
        uploads: new FilesystemRepositoryPublicationUploadStore(root),
    });
    const read = new RepositoryReadEndpoint(root);
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            return (
                (await mutation.handle(request)) ?? (await read.handle(request)) ?? new Response(null, { status: 404 })
            );
        },
    });
    try {
        const client = new RemoteRepositoryClient(server.url.href, credential, { allowInsecureHttp: true });
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
            `/v1/contracts/publisher/${coordinate.id}/${coordinate.version}/docs/${encodeURIComponent("guides/send.md")}`,
            server.url,
        );
        const response = await fetch(url);
        expect(response.headers.get("etag")).toBe(`"${f.document.digest}"`);
        expect(response.headers.get("content-type")).toContain("text/markdown");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(f.bytes);
        const head = await fetch(url, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(Number(head.headers.get("content-length"))).toBe(f.bytes.byteLength);
        expect(
            (
                await fetch(
                    new URL(
                        `/v1/contracts/publisher/${coordinate.id}/${coordinate.version}/docs/${encodeURIComponent("../private.md")}`,
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
        await rm(root, { recursive: true, force: true });
    }
});
