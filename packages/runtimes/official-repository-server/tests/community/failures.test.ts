import { expect, test } from "bun:test";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
    FilesystemRepositoryNamespaceStore,
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryNamespaceAuthority } from "@bernouy/cms-repository/repository/namespaces";
import { createRepositoryCapabilities } from "../../src/community/application";
import { cataloguePorts } from "../../src/community/catalogue";
import { communityFixture, capabilityProof, simpleContract } from "./fixtures";

test("a receipt write failure after publication remains outcome-unknown in the Gateway and durable audit", async () => {
    const f = await communityFixture();
    try {
        const uploads = new FilesystemRepositoryPublicationUploadStore(f.root);
        const registry = new FilesystemRepositoryPublicationRegistry(f.root);
        const manifest = { kind: "contract" as const, canonicalJson: simpleContract(), assets: [] };
        const receipt = await uploads.create(manifest, new Date(Date.now() + 60_000));
        const resultPath = join(f.root, ".publication-uploads", receipt.uploadId, "result.json");
        let fail = true;
        const handler = await createRepositoryCapabilities(
            f.root,
            {
                namespaces: new RepositoryNamespaceAuthority(
                    f.credential.repositoryId,
                    new FilesystemRepositoryNamespaceStore(f.root),
                ),
                uploads,
                registry: {
                    async publish(envelope) {
                        const result = await registry.publish(envelope);
                        if (fail) {
                            // A real filesystem fault after the immutable release becomes visible.
                            await mkdir(resultPath);
                        }
                        return result;
                    },
                    setYank: (...args) => registry.setYank(...args),
                },
                ...cataloguePorts(new RepositoryReadEndpoint(f.root)),
            },
            f.base,
        );
        const input = {
            namespace: "community",
            uploadId: receipt.uploadId,
            proof: capabilityProof(f.credential, f.key.privateKey, "publication-commit", receipt.uploadId, {
                uploadId: receipt.uploadId,
            }),
        };
        const send = (value: unknown) =>
            handler(
                new Request(`${f.base}v1/uploads/commit`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(value),
                }),
            );
        const failed = await send(input);
        expect(failed?.status).toBe(409);
        expect(await failed!.text()).toContain("outcome_unknown");
        expect((await fetch(`${f.base}v1/contracts/community/community.example/1.0.0`)).status).toBe(200);
        const events = [];
        const audit = join(f.root, ".capability-audit");
        for (const day of await readdir(audit)) {
            for (const file of await readdir(join(audit, day))) {
                events.push(JSON.parse(await readFile(join(audit, day, file), "utf8")));
            }
        }
        expect(events.map((event) => event.stage).sort()).toEqual(["outcome-unknown", "started"]);
        fail = false;
        await rm(resultPath, { recursive: true });
        const retry = await send(input);
        expect(retry?.status).toBe(200);
        expect(((await retry!.json()) as { added: boolean }).added).toBe(false);
        const rejected = await send({ ...input, namespace: "foreign" });
        expect(rejected?.status).toBe(409);
        expect(await rejected!.text()).toContain("REJECTED");
        const invalidManifest = { kind: "contract", canonicalJson: "null", assets: [] };
        const invalid = await handler(
            new Request(`${f.base}v1/uploads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    namespace: "community",
                    manifest: JSON.stringify({ protocol: "ulvia-repository-upload/v1", ...invalidManifest }),
                    proof: capabilityProof(
                        f.credential,
                        f.key.privateKey,
                        "publication-begin",
                        "community",
                        invalidManifest,
                    ),
                }),
            }),
        );
        expect(invalid?.status).toBe(409);
        expect(await invalid!.text()).toContain("REJECTED");
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});
