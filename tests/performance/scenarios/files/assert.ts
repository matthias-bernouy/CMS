import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { assertCondition, requireRecord } from "../queries/types";
import type { FileFixture } from "./fixture";

export async function assertFileResult(state: FileFixture, capability: string, value: unknown): Promise<void> {
    if (capability === "files.read") {
        assertCondition(value instanceof Uint8Array && Buffer.from(value).equals(Buffer.from(state.bytes)));
        return;
    }
    if (capability === "representations.read") {
        assertCondition(value instanceof Uint8Array && value.byteLength > 0);
        const metadata = await new SharpImageTransformer().inspect(value, {
            strict: true,
            maxInputPixels: 4096,
            timeoutMs: 2000,
        });
        assertCondition(metadata.width === 64 && metadata.height === 64 && metadata.pages === 1);
        return;
    }
    if (
        [
            "namespace.delete",
            "namespace.keys.revoke",
            "files.delete",
            "upload.write",
            "workspace.upload.complete",
            "workspace.files.delete",
            "workspace.files.set-visibility",
            "workspace.files.update",
        ].includes(capability)
    ) {
        assertCondition(value === null);
        return;
    }
    const output = requireRecord(value);
    if (["namespace.create", "namespace.keys.create", "namespace.keys.rotate"].includes(capability)) {
        assertCondition(
            typeof output.namespaceKey === "string" &&
                output.namespaceKey.length >= 20 &&
                typeof output.keyId === "string",
        );
    }
    if (capability === "namespace.create") {
        assertCondition(typeof output.namespaceId === "string" && output.namespaceId.length > 0);
    }
    if (capability === "namespace.get") {
        assertCondition(output.id === state.namespace!.namespaceId && output.name === state.name);
    }
    if (["upload.create", "workspace.upload.create"].includes(capability)) {
        assertCondition(
            typeof output.uploadId === "string" &&
                typeof output.uploadToken === "string" &&
                Number(output.maxBytes) >= state.bytes.byteLength,
        );
    }
    if (["files.get", "files.publish", "files.make-private", "files.update", "upload.complete"].includes(capability)) {
        assertCondition(
            typeof output.fileId === "string" &&
                typeof output.generation === "string" &&
                output.size === state.bytes.byteLength,
        );
        if (state.file) {
            assertCondition(output.fileId === state.file.fileId);
        }
        if (capability === "files.publish") {
            assertCondition(output.visibility === "public");
        }
        if (capability === "files.make-private") {
            assertCondition(output.visibility === "private");
        }
        if (capability === "files.update") {
            assertCondition(output.name === "renamed-performance.png");
        }
    }
    if (capability === "files.list" || capability === "workspace.get") {
        assertCondition(Array.isArray(output.items) && output.items.some((item) => item.fileId === state.file!.fileId));
    }
    if (capability === "representations.list") {
        assertCondition(
            requireRecord(output.original).fileId === state.file!.fileId &&
                Array.isArray(output.representations) &&
                output.representations.some((item) => item.width === 64 && item.profile === "thumbnail"),
        );
    }
    if (capability === "representations.sign") {
        assertCondition(Array.isArray(output.representations) && output.representations.length > 0);
    }
    if (capability.endsWith(".sign")) {
        assertCondition(typeof output.expiresAt === "string" && Date.parse(output.expiresAt) > Date.now());
    }
}
