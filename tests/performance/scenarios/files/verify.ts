import { assertCondition, requireRecord } from "../queries/types";
import { isolatedOrigin, responseBytes } from "../../harness/transport/http";
import { findWorkspaceFile } from "./fixture";
import type { FileFixture } from "./fixture";

export async function verifyFileResult(state: FileFixture, capability: string, result: unknown, origin: string) {
    const credentials = state.credentials;
    if (capability === "namespace.create") {
        const output = requireRecord(result);
        const saved = requireRecord(
            await state.fixture("namespace.get", {
                namespaceId: output.namespaceId,
                namespaceKey: output.namespaceKey,
            }),
        );
        assertCondition(saved.name === state.name);
    } else if (capability === "namespace.delete") {
        const denied = await state.call("namespace.get", "http", credentials);
        assertCondition([403, 404].includes(denied.observation.status));
    } else if (capability === "namespace.keys.rotate" || capability === "namespace.keys.revoke") {
        const denied = await state.call("namespace.get", "http", {
            ...credentials,
            namespaceKey: state.key!.namespaceKey,
        });
        assertCondition([403, 404].includes(denied.observation.status));
        if (capability === "namespace.keys.rotate") {
            const saved = requireRecord(
                await state.fixture("namespace.get", {
                    ...credentials,
                    namespaceKey: requireRecord(result).namespaceKey,
                }),
            );
            assertCondition(saved.id === state.namespace!.namespaceId);
        }
    } else if (capability === "namespace.keys.create") {
        const saved = requireRecord(
            await state.fixture("namespace.get", { ...credentials, namespaceKey: requireRecord(result).namespaceKey }),
        );
        assertCondition(saved.id === state.namespace!.namespaceId);
    } else if (["upload.create", "workspace.upload.create"].includes(capability)) {
        const upload = requireRecord(result);
        await state.write(upload);
        state.file = await state.finish(upload);
        assertCondition(state.file?.size === state.bytes.byteLength);
    } else if (capability === "upload.write") {
        state.file = await state.finish(state.upload!);
        assertCondition(state.file?.size === state.bytes.byteLength);
    } else if (["upload.complete", "workspace.upload.complete"].includes(capability)) {
        state.file = state.workspace ? await findWorkspaceFile(state, state.name) : requireRecord(result);
        assertCondition(state.file?.size === state.bytes.byteLength);
    } else if (capability === "files.delete" || capability === "workspace.files.delete") {
        const deleted = await state.call("files.read", "http", {
            fileId: state.file!.fileId,
            generation: state.file!.generation,
        });
        assertCondition(deleted.observation.status === 404);
    } else if (
        capability.endsWith(".update") ||
        capability === "files.publish" ||
        capability === "files.make-private" ||
        capability === "workspace.files.set-visibility"
    ) {
        const current = state.workspace
            ? await findWorkspaceFile(state, state.name, state.file!.fileId)
            : requireRecord(await state.fixture("files.get", { ...credentials, fileId: state.file!.fileId }));
        assertCondition(current && current.fileId === state.file!.fileId);
        if (capability.endsWith(".update")) {
            assertCondition(current.name === "renamed-performance.png");
        }
        if (capability === "files.publish") {
            assertCondition(current.visibility === "public");
        }
        if (capability === "files.make-private" || capability === "workspace.files.set-visibility") {
            assertCondition(current.visibility === "private");
        }
    } else if (capability.endsWith(".sign")) {
        const output = requireRecord(result);
        const urls =
            capability === "representations.sign"
                ? (output.representations as Record<string, unknown>[]).map((item) => item.url)
                : [output.url];
        for (const value of urls) {
            assertCondition(typeof value === "string");
            const url = new URL(value, origin);
            assertCondition(isolatedOrigin(url.origin) === origin);
            const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
            const bytes = await responseBytes(response);
            assertCondition(response.ok && bytes.byteLength > 0);
            if (capability !== "representations.sign") {
                assertCondition(Buffer.from(bytes).equals(Buffer.from(state.bytes)));
            }
        }
    }
}
