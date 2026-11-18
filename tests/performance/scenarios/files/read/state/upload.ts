import { createHash } from "node:crypto";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { pngFixture } from "../../../../fixtures/png";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { FileCalls } from "../../client";

export type StoredRaster = Readonly<{
    reference: Readonly<Record<string, unknown>>;
    bytes: Uint8Array;
    dimension: number;
    derived: boolean;
    derivativeBytes?: Uint8Array;
}>;

export async function uploadRaster(
    calls: FileCalls,
    credentials: Readonly<Record<string, unknown>>,
    name: string,
    dimension: number,
    derived: boolean,
    fileId?: unknown,
): Promise<StoredRaster> {
    const bytes = pngFixture(dimension, dimension);
    const upload = requireRecord(
        await calls.fixture("upload.create", {
            ...credentials,
            filename: name,
            size: bytes.byteLength,
            contentType: "image/png",
            visibility: "public",
            ...(derived ? { imageProfile: "thumbnail" } : {}),
            ...(fileId ? { fileId } : {}),
        }),
    );
    await calls.fixture("upload.write", { uploadId: upload.uploadId, uploadToken: upload.uploadToken, bytes });
    const reference = requireRecord(
        await calls.fixture("upload.complete", { ...credentials, uploadId: upload.uploadId }),
    );
    assertCondition(
        reference.generation === createHash("sha256").update(bytes).digest("hex"),
        "file-generation-not-content-hash",
    );
    assertCondition(
        reference.namespaceId === credentials.namespaceId &&
            reference.name === name &&
            reference.size === bytes.byteLength,
        "file-upload-receipt",
    );
    if (fileId) {
        assertCondition(reference.fileId === fileId, "file-replacement-identity");
    }
    if (derived) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const output = requireRecord(
                await calls.fixture("representations.list", {
                    fileId: reference.fileId,
                    generation: reference.generation,
                }),
            );
            if (Array.isArray(output.representations) && output.representations.length === 3) {
                assertCondition(
                    output.representations.every((row, index) => row.width === [64, 128, 256][index]),
                    "file-derivative-widths",
                );
                const transformed = await new SharpImageTransformer().transform(bytes, {
                    width: 64,
                    quality: 82,
                    autoOrient: true,
                    colourspace: "srgb",
                    strict: true,
                    maxInputPixels: 512 * 512,
                    timeoutMs: 2000,
                });
                return { reference, bytes, dimension, derived, derivativeBytes: transformed.bytes };
            }
            await Bun.sleep(100);
        }
        assertCondition(false, "file-derivatives-did-not-complete");
    }
    return { reference, bytes, dimension, derived };
}
