import { createHash } from "node:crypto";
import type { FileCalls } from "../../client";
import type { Observation } from "../../../../harness/clients/types";

/** In-memory writer receipts test fixture construction; measured runs use the real API. */
export function rasterModel() {
    let sequence = 0;
    const uploads = new Map<unknown, Readonly<Record<string, unknown>>>();
    const files = new Map<unknown, Readonly<Record<string, unknown>>>();
    const revoked = new Set<unknown>();
    const bodies = new Map<unknown, Uint8Array>();
    let privateFile = false;
    const events: string[] = [];
    let privateReadAccepted = false;
    const observation: Observation = {
        traceId: "unit-trace",
        durationMs: 1,
        requestBytes: 1,
        responseBytes: 1,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
    };
    const fixture: FileCalls["fixture"] = async (capability, input) => {
        events.push(capability);
        if (capability === "namespace.create") {
            const id = `namespace-${++sequence}`;
            return { namespaceId: id, namespaceKey: `root-${id}` };
        }
        if (capability === "namespace.get") {
            return {
                id: input.namespaceId,
                name: "unit-namespace",
                defaultVisibility: "public",
                createdAt: "2026-11-18T00:00:00.000Z",
                quota: { maxBytes: 10 ** 9, maxFiles: 1000 },
            };
        }
        if (capability === "namespace.keys.create" || capability === "namespace.keys.rotate") {
            if (input.keyId) {
                revoked.add(input.keyId);
            }
            const keyId = `key-${++sequence}`;
            return { keyId, namespaceKey: keyId };
        }
        if (capability === "upload.create") {
            const uploadId = `upload-${++sequence}`;
            uploads.set(uploadId, input);
            return { uploadId, uploadToken: "unit-upload-token" };
        }
        if (capability === "upload.write") {
            uploads.set(input.uploadId, { ...uploads.get(input.uploadId), bytes: input.bytes });
            return null;
        }
        if (capability === "upload.complete") {
            const upload = uploads.get(input.uploadId)!;
            const bytes = upload.bytes as Uint8Array;
            const generation = createHash("sha256").update(bytes).digest("hex");
            const fileId = upload.fileId ?? `file-${++sequence}`;
            const path = `/.cms/call/ulvia/cms.files/files/${fileId}/${generation}`;
            const output = {
                fileId,
                generation,
                namespaceId: upload.namespaceId,
                name: upload.filename,
                mimeType: "image/png",
                size: bytes.byteLength,
                visibility: "public",
                url: `http://unit.test${path}`,
                path,
            };
            files.set(fileId, output);
            bodies.set(generation, bytes);
            return output;
        }
        if (capability === "files.get") {
            return files.get(input.fileId);
        }
        if (capability === "files.list") {
            return {
                items: [...files.values()]
                    .filter((row) => row.namespaceId === input.namespaceId)
                    .reverse()
                    .slice(Number(input.offset ?? 0), Number(input.offset ?? 0) + Number(input.limit)),
                offset: input.offset,
                limit: input.limit,
            };
        }
        if (capability === "files.make-private" || capability === "files.publish") {
            privateFile = capability === "files.make-private";
            return null;
        }
        throw Error(`Unexpected controlled fixture call: ${capability}`);
    };
    const call: FileCalls["call"] = async (capability, _binding, input, assert = () => {}) => {
        events.push(`read:${capability}`);
        if (capability === "namespace.get" && revoked.has(input.namespaceKey)) {
            return { output: undefined, observation: { ...observation, validated: false, status: 403 } };
        }
        if (capability === "files.read") {
            if (!privateFile || privateReadAccepted) {
                const output = bodies.get(input.generation);
                await assert(output);
                return { output, observation };
            }
            return {
                output: undefined,
                observation: {
                    ...observation,
                    validated: privateReadAccepted,
                    status: privateReadAccepted ? 200 : 403,
                },
            };
        }
        const output = await fixture(capability, input);
        await assert(output);
        return { output, observation };
    };
    return {
        calls: { fixture, call },
        events,
        uploads,
        files,
        leakPrivateRead() {
            privateReadAccepted = true;
        },
    };
}
