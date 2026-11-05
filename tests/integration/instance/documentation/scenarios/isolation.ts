import { expect } from "bun:test";
import { invoke, refusal } from "./client";
import type { Connection } from "./client";

export async function instanceIsolation(
    primary: Connection,
    neighbour: Connection,
    primaryUrl: string,
    neighbourUrl: string,
) {
    const draft = await primary.call("ulvia/cms.content", "pages.create", {
        path: "/tenant-private",
        title: "Private tenant draft",
    });
    refusal(await invoke(neighbour, "ulvia/cms.content", "pages.get", { id: draft.id }), "NOT_FOUND");
    const own = await neighbour.call("ulvia/cms.content", "pages.create", {
        path: draft.path,
        title: "Independent tenant draft",
    });
    expect(own.id).not.toBe(draft.id);
    expect((await primary.call("ulvia/cms.content", "pages.get", { id: draft.id })).title).toBe(draft.title);
    expect(
        (
            await fetch(`${neighbourUrl}/.cms/mcp`, {
                method: "POST",
                headers: { Authorization: `Bearer ${primary.token.access_token}` },
                body: "{}",
            })
        ).status,
    ).toBe(401);
    const bytes = new TextEncoder().encode("Private bytes belonging to the primary instance");
    const upload = await primary.call("ulvia/cms.files", "workspace.upload.create", {
        filename: "tenant-private.txt",
        size: bytes.byteLength,
        contentType: "text/plain",
        visibility: "private",
    });
    const before = await neighbour.call("ulvia/cms.files", "workspace.get");
    const foreignUrl = upload.uploadUrl.replace(primaryUrl, neighbourUrl);
    const refused = await fetch(foreignUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${neighbour.token.access_token}`, "Upload-Token": upload.uploadToken },
        body: bytes,
    });
    expect([401, 403, 404]).toContain(refused.status);
    await refused.body?.cancel();
    expect(await neighbour.call("ulvia/cms.files", "workspace.get")).toEqual(before);
    expect(
        (
            await fetch(upload.uploadUrl, {
                method: "PUT",
                headers: { Authorization: `Bearer ${primary.token.access_token}`, "Upload-Token": upload.uploadToken },
                body: bytes,
            })
        ).status,
    ).toBe(204);
    await primary.call("ulvia/cms.files", "workspace.upload.complete", { uploadId: upload.uploadId });
    const workspace = await primary.call("ulvia/cms.files", "workspace.get");
    const file = workspace.items.find((item: { name: string }) => item.name === "tenant-private.txt");
    expect(file).toBeDefined();
    refusal(
        await invoke(neighbour, "ulvia/cms.files", "workspace.files.sign", {
            fileId: file.fileId,
            generation: file.generation,
            expiresIn: 60,
        }),
        "NOT_FOUND",
    );
    const signed = await primary.call("ulvia/cms.files", "workspace.files.sign", {
        fileId: file.fileId,
        generation: file.generation,
        expiresIn: 60,
    });
    expect(await (await fetch(signed.url)).text()).toBe(new TextDecoder().decode(bytes));
    expect(await neighbour.call("ulvia/cms.files", "workspace.get")).toEqual(before);
}
