import type { FileFixture } from "../fixture";

export function fileInput(state: FileFixture, capability: string): Readonly<Record<string, unknown>> {
    const reference = state.file ? { fileId: state.file.fileId, generation: state.file.generation } : {};
    if (capability === "namespace.create") {
        return { name: state.name, defaultVisibility: "public" };
    }
    if (capability === "namespace.keys.create") {
        return { ...state.credentials, permissions: ["files.read", "namespace.manage"] };
    }
    if (capability.startsWith("namespace.keys.")) {
        return { ...state.credentials, keyId: state.key!.keyId };
    }
    if (capability.startsWith("namespace.")) {
        return state.credentials;
    }
    if (["upload.create", "workspace.upload.create"].includes(capability)) {
        return state.uploadInput;
    }
    if (capability === "upload.write") {
        return { uploadId: state.upload!.uploadId, uploadToken: state.upload!.uploadToken, bytes: state.bytes };
    }
    if (["upload.complete", "workspace.upload.complete"].includes(capability)) {
        return { ...state.credentials, uploadId: state.upload!.uploadId };
    }
    if (capability === "workspace.get") {
        return { offset: 0, limit: 100 };
    }
    if (capability === "files.list") {
        return { ...state.credentials, offset: 0, limit: 25 };
    }
    if (capability === "files.read" || capability === "representations.list") {
        return reference;
    }
    if (capability === "representations.read") {
        return { ...reference, profile: "thumbnail", width: 64 };
    }
    if (capability === "representations.sign") {
        return { ...state.credentials, ...reference, expiresIn: 60 };
    }
    if (["files.sign", "workspace.files.sign"].includes(capability)) {
        return {
            ...state.credentials,
            ...reference,
            expiresIn: 60,
            ...(capability === "files.sign" ? { operation: "read" } : {}),
        };
    }
    const input = { ...(state.workspace ? {} : state.credentials), fileId: state.file!.fileId };
    if (capability.endsWith(".update")) {
        return { ...input, name: "renamed-performance.png" };
    }
    if (capability === "workspace.files.set-visibility") {
        return { ...input, visibility: "private" };
    }
    return input;
}
