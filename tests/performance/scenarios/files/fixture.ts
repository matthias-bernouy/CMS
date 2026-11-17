import { randomUUID } from "node:crypto";
import { pngFixture } from "../../fixtures/png";
import { assertCondition, requireRecord } from "../queries/types";
import { fileCalls } from "./client";
import type { ScenarioClient } from "../../harness/clients/session";
import type { FileCalls } from "./client";

export async function findWorkspaceFile(calls: FileCalls, name: string, fileId?: unknown) {
    const listing = requireRecord(await calls.fixture("workspace.get", { offset: 0, limit: 100 }));
    assertCondition(Array.isArray(listing.items));
    const file = listing.items.find((item) => (fileId ? item.fileId === fileId : item.name === name));
    return file ? requireRecord(file) : null;
}

export async function waitRepresentations(calls: FileCalls, file: Readonly<Record<string, unknown>>) {
    for (let attempt = 0; attempt < 60; attempt++) {
        const output = requireRecord(
            await calls.fixture("representations.list", { fileId: file.fileId, generation: file.generation }),
        );
        if (Array.isArray(output.representations) && output.representations.length > 0) {
            return output;
        }
        await Bun.sleep(100);
    }
    throw new Error("The controlled raster fixture did not finish producing representations");
}

export async function fileFixture(client: ScenarioClient, capability: string) {
    const calls = fileCalls(client);
    const name = `performance-${randomUUID()}.png`;
    const bytes = pngFixture();
    const workspace = capability.startsWith("workspace.");
    const namespace =
        workspace || capability === "namespace.create"
            ? null
            : requireRecord(await calls.fixture("namespace.create", { name, defaultVisibility: "public" }));
    const credentials = namespace ? { namespaceId: namespace.namespaceId, namespaceKey: namespace.namespaceKey } : {};
    const key = ["namespace.keys.rotate", "namespace.keys.revoke"].includes(capability)
        ? requireRecord(
              await calls.fixture("namespace.keys.create", {
                  ...credentials,
                  permissions: ["files.read", "namespace.manage"],
              }),
          )
        : null;
    const visibility = ["files.publish", "files.sign", "workspace.files.sign"].includes(capability)
        ? "private"
        : "public";
    const uploadInput = {
        ...credentials,
        filename: name,
        size: bytes.byteLength,
        contentType: "image/png",
        visibility,
        ...(capability.startsWith("representations.") ? { imageProfile: "thumbnail" } : {}),
    };
    const uploadCreate = workspace ? "workspace.upload.create" : "upload.create";
    const uploadComplete = workspace ? "workspace.upload.complete" : "upload.complete";
    const namespaceOnly = capability.startsWith("namespace.");
    const createOnly = ["upload.create", "workspace.upload.create"].includes(capability);
    const upload = namespaceOnly || createOnly ? null : requireRecord(await calls.fixture(uploadCreate, uploadInput));
    const write = async (handle: Readonly<Record<string, unknown>>) =>
        calls.fixture("upload.write", { uploadId: handle.uploadId, uploadToken: handle.uploadToken, bytes });
    const finish = async (handle: Readonly<Record<string, unknown>>) => {
        const completed = await calls.fixture(uploadComplete, { ...credentials, uploadId: handle.uploadId });
        return workspace ? findWorkspaceFile(calls, name) : requireRecord(completed);
    };
    let file: Readonly<Record<string, unknown>> | null = null;
    if (upload && capability !== "upload.write") {
        await write(upload);
        if (!["upload.complete", "workspace.upload.complete"].includes(capability)) {
            file = await finish(upload);
        }
    }
    const representations =
        file && capability.startsWith("representations.") ? await waitRepresentations(calls, file) : null;
    return {
        ...calls,
        name,
        bytes,
        workspace,
        namespace,
        credentials,
        key,
        uploadInput,
        upload,
        file,
        representations,
        write,
        finish,
    };
}

export type FileFixture = Awaited<ReturnType<typeof fileFixture>>;
