import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import {
    InMemoryCmsFilesMetadata,
    replaceAuthorFileRequest,
    uploadAuthorFileRequest,
} from "@bernouy/cms-content/files";

describe("author file mutation transports", () => {
    test("uploads a bounded multipart file and preserves an optional parent", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const parent = await metadata.createFolder({ name: "Documents", parentId: null });
        const form = new FormData();
        form.set("file", new File(["first"], "notes.txt", { type: "text/plain" }));
        form.set("parentId", parent.id);

        const response = await uploadAuthorFileRequest(request("POST", form), { metadata, blob });
        const item = (await response.json()) as { id: string; parentId: string; name: string };

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(item).toMatchObject({ parentId: parent.id, name: "notes.txt" });
        expect(await blob.exists(item.id)).toBe(true);
    });

    test("replaces bytes in place and invokes the invalidation hook", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const upload = new FormData();
        upload.set("file", new File(["before"], "notes.txt", { type: "text/plain" }));
        const created = (await (await uploadAuthorFileRequest(request("POST", upload), { metadata, blob })).json()) as {
            id: string;
        };
        const updated: string[] = [];
        const replacement = new FormData();
        replacement.set("id", created.id);
        replacement.set("file", new File(["after"], "ignored.txt", { type: "text/plain" }));

        const response = await replaceAuthorFileRequest(request("PUT", replacement), {
            metadata,
            blob,
            afterContentUpdated: async (item) => {
                updated.push(item.id);
            },
        });
        const item = (await response.json()) as { id: string; name: string; size: number };

        expect(item).toMatchObject({ id: created.id, name: "notes.txt", size: 5 });
        expect(updated).toEqual([created.id]);
    });

    test("rejects a multipart request without a file", async () => {
        const metadata = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        await expect(
            uploadAuthorFileRequest(request("POST", new FormData()), { metadata, blob }),
        ).rejects.toMatchObject({
            status: 422,
            publicCode: "INVALID_INPUT",
            field: "file",
        });
    });
});

function request(method: string, body: FormData): Request {
    return new Request("http://localhost/.cms/files", { method, body });
}
