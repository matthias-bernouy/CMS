import { expect } from "bun:test";
import { cachedPage, publishPage, type Connection } from "./context";
export async function exerciseFileFreshness(connection: Connection, cmsUrl: string) {
    const call = (capability: string, input: Record<string, unknown> = {}) =>
        connection.call("ulvia.cms.files", capability, input);
    const bytes = new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#123abc" d="M1 1h10v10H1z"/></svg>',
    );
    const upload = await call("workspace.upload.create", {
        filename: "cache.svg",
        size: bytes.length,
        contentType: "image/svg+xml",
        visibility: "public",
    });
    const written = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${connection.token.access_token}`,
            "Upload-Token": upload.uploadToken,
        },
        body: bytes,
    });
    expect(written.status).toBe(204);
    const ordinary = cachedPage(cmsUrl, "/cache-collection");
    await ordinary.warm();
    await call("workspace.upload.complete", { uploadId: upload.uploadId });
    expect((await ordinary.read("MISS")).status).toBe(200);
    const workspace = await call("workspace.get");
    const file = workspace.items.find((item: { name: string }) => item.name === "cache.svg");
    expect(file).toBeDefined();
    const url = `/.cms/call/ulvia.cms.files/files/${file.fileId}/${file.generation}`;
    await publishPage(
        connection,
        "/cache-file",
        `<div cms-bloc="cache-kit-media-host"><img src="${url}" alt="File freshness"></div>`,
    );
    const page = cachedPage(cmsUrl, "/cache-file");
    expect((await page.warm()).text).toContain(url);
    const readFile = async (expected: number) => {
        const response = await fetch(new URL(url, cmsUrl));
        expect(response.status).toBe(expected);
        const text = await response.text();
        if (expected === 200) {
            expect(text).toContain("#123abc");
        } else {
            expect(text).not.toContain("#123abc");
        }
    };
    await readFile(200);
    await call("workspace.files.update", { fileId: file.fileId, name: "renamed.svg" });
    expect((await page.read("MISS")).status).toBe(200);
    const renamed = await call("workspace.get");
    expect(renamed.items.find((item: { fileId: string }) => item.fileId === file.fileId).name).toBe("renamed.svg");
    await page.read("HIT");
    await call("workspace.files.set-visibility", { fileId: file.fileId, visibility: "private" });
    expect((await page.read("MISS")).status).toBe(200);
    await readFile(403);
    await call("workspace.files.set-visibility", { fileId: file.fileId, visibility: "public" });
    expect((await page.read("MISS")).status).toBe(200);
    await page.read("HIT");
    await readFile(200);
    await call("workspace.files.delete", { fileId: file.fileId });
    expect((await page.read("MISS")).status).toBe(200);
    await readFile(404);
    return { completeImmediate: true, updateImmediate: true, visibilityImmediate: true, deleteImmediate: true };
}
