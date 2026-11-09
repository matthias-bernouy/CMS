import { expect } from "bun:test";
import { repositoryApi } from "../../repository/client";
import type { Connection } from "./context";

export type FileIsolationTarget = Readonly<{
    origin: string;
    administrator: { email: string; password: string };
}>;

/** Exercise actual public reads, a foreign credential and the other tenant's authenticated administrator. */
export async function verifyFileIsolation(
    owner: Connection,
    target: FileIsolationTarget,
    file: { fileId: string; generation: string; name: string },
) {
    const api = repositoryApi(target.origin);
    const actor = await api.session(target.administrator.email, target.administrator.password);
    expect(actor.administrator).toBeTrue();
    const workspace = async () => {
        const response = await api.request("ulvia/cms.files", "/workspace.get", "QUERY", { limit: 100 }, actor);
        expect(response.status).toBe(200);
        return response.json();
    };
    const before = await workspace();
    expect(before.items).toEqual([]);
    const path = `/.cms/call/ulvia/cms.files/files/${file.fileId}/${file.generation}`;
    const anonymous = await fetch(new URL(path, target.origin), { redirect: "manual" });
    expect(anonymous.status).toBe(404);
    expect(await anonymous.text()).not.toContain("#123abc");
    const credential = await fetch(new URL(path, target.origin), {
        headers: { authorization: `Bearer ${owner.token.access_token}` },
        redirect: "manual",
    });
    expect([401, 403, 404]).toContain(credential.status);
    expect(await credential.text()).not.toContain("#123abc");
    const changed = await api.request(
        "ulvia/cms.files",
        "/workspace.files.update",
        "POST",
        {
            fileId: file.fileId,
            name: "foreign-rename.svg",
        },
        actor,
    );
    expect(changed.status).toBe(404);
    await changed.body?.cancel();
    expect((await workspace()).items).toEqual(before.items);
    const owned = await owner.call("ulvia/cms.files", "workspace.get", {});
    expect(owned.items.find((item: { fileId: string }) => item.fileId === file.fileId)).toEqual(file);
}
