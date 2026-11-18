import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { FileCalls } from "../../client";

export async function workspaceRows(calls: FileCalls) {
    const items: Readonly<Record<string, unknown>>[] = [];
    let namespace: Readonly<Record<string, unknown>> | undefined;
    for (let offset = 0; offset <= 256; offset += 16) {
        const output = requireRecord(await calls.fixture("workspace.get", { offset, limit: 16 }));
        const current = requireRecord(output.namespace);
        assertCondition(
            !namespace || canonicalizeIJson(namespace) === canonicalizeIJson(current),
            "workspace-pagination-namespace",
        );
        namespace = current;
        assertCondition(Array.isArray(output.items) && output.items.length <= 16, "workspace-pagination-bound");
        items.push(...output.items.map(requireRecord));
        if (output.items.length < 16) {
            return { namespace, items };
        }
    }
    throw Error("The isolated workspace fixture exceeded its expected 256-file bound");
}

export function workspaceReadState(calls: FileCalls) {
    const originalName = `performance-${randomUUID()}.txt`;
    const bytes = new TextEncoder().encode(`Owned performance workspace fixture ${randomUUID()}`);
    let file: Readonly<Record<string, unknown>> | undefined;
    let baseline: Awaited<ReturnType<typeof workspaceRows>>;
    let name = originalName;
    return {
        calls,
        async initialize() {
            baseline = await workspaceRows(calls);
            const upload = requireRecord(
                await calls.fixture("workspace.upload.create", {
                    filename: name,
                    size: bytes.byteLength,
                    contentType: "text/plain",
                    visibility: "public",
                }),
            );
            await calls.fixture("upload.write", { uploadId: upload.uploadId, uploadToken: upload.uploadToken, bytes });
            await calls.fixture("workspace.upload.complete", { uploadId: upload.uploadId });
            const after = await workspaceRows(calls);
            const matches = after.items.filter((row) => row.name === name);
            assertCondition(matches.length === 1, "workspace-upload-identity-not-unique");
            file = matches[0]!;
            const read = await calls.call(
                "files.read",
                "http",
                { fileId: file.fileId, generation: file.generation },
                (value) => {
                    assertCondition(
                        value instanceof Uint8Array && Buffer.from(value).equals(Buffer.from(bytes)),
                        "workspace-upload-body-identity",
                    );
                },
            );
            assertCondition(read.observation.validated, "workspace-upload-readback");
        },
        async rename(index: number) {
            name = `performance-renamed-${index}-${originalName}`;
            await calls.fixture("workspace.files.update", { fileId: file!.fileId, name });
        },
        get file() {
            return file!;
        },
        get namespace() {
            return baseline.namespace;
        },
        assertPage(value: unknown) {
            const output = requireRecord(value);
            assertCondition(
                output.offset === 0 &&
                    output.limit === 100 &&
                    canonicalizeIJson(output.namespace) === canonicalizeIJson(baseline.namespace),
                "workspace-reader-page-shape",
            );
            assertCondition(Array.isArray(output.items), "workspace-reader-items");
            const matches = output.items.filter((row) => row.fileId === file!.fileId);
            assertCondition(
                matches.length === 1 && canonicalizeIJson(matches[0]) === canonicalizeIJson({ ...file, name }),
                "workspace-stale-file-after-rename",
            );
            assertCondition(
                canonicalizeIJson(output.items.filter((row) => row.fileId !== file!.fileId)) ===
                    canonicalizeIJson(baseline.items),
                "workspace-unrelated-files-changed",
            );
        },
        async close() {
            if (file) {
                await calls.fixture("workspace.files.delete", { fileId: file.fileId });
                assertCondition(
                    canonicalizeIJson(await workspaceRows(calls)) === canonicalizeIJson(baseline),
                    "workspace-owned-cleanup",
                );
            }
        },
    };
}

export type WorkspaceReadState = ReturnType<typeof workspaceReadState>;
