import { expect, test } from "bun:test";
import { filesFixture } from "./fixture";

test("all managed workspace capabilities run without exposing namespace credentials", async () => {
    const f = await filesFixture();
    try {
        const workspace = await f.invoke("workspace.get", { limit: 10 });
        expect(workspace.namespace.createdBy).toEqual({ kind: "system", id: "workspace" });
        expect(JSON.stringify(workspace)).not.toContain("namespaceKey");
        const session = await f.invoke("workspace.upload.create", {
            filename: "asset.txt",
            size: 5,
            contentType: null,
            imageProfile: null,
            fileId: null,
        });
        await f.invoke(
            "upload.write",
            { uploadId: session.uploadId, uploadToken: session.uploadToken, bytes: new Uint8Array() },
            { bytes: "hello" },
        );
        expect(await f.invoke("workspace.upload.complete", { uploadId: session.uploadId })).toBeNull();
        const file = (await f.invoke("workspace.get", {})).items[0]!;
        expect(await f.invoke("workspace.files.update", { fileId: file.fileId, name: "renamed.txt" })).toBeNull();
        expect(
            await f.invoke("workspace.files.set-visibility", { fileId: file.fileId, visibility: "public" }),
        ).toBeNull();
        const signed = await f.invoke("workspace.files.sign", {
            fileId: file.fileId,
            generation: file.generation,
            expiresIn: 60,
        });
        expect(signed.url).toContain("access=");
        const before = { ...f.counts };
        expect(
            (await f.call("workspace.files.set-visibility", { fileId: file.fileId, visibility: "shared" })).status,
        ).toBe(400);
        expect(f.counts).toEqual(before);
        expect(await f.invoke("workspace.files.delete", { fileId: file.fileId })).toBeNull();
        expect((await f.invoke("workspace.get", {})).items).toEqual([]);
    } finally {
        f.close();
    }
});
