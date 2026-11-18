import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { assertCondition, requireRecord } from "../../queries/types";
import type { StoredRaster } from "./state/upload";

export function rasterReference(file: StoredRaster, origin: string) {
    const path = `/.cms/call/ulvia/cms.files/files/${file.reference.fileId}/${file.reference.generation}`;
    const variants = [64, 128, 256].map((width) => ({
        profile: "thumbnail",
        width,
        height: width,
        mimeType: "image/webp",
        path: `${path}/representations/thumbnail/${width}.webp`,
        url: `${origin}${path}/representations/thumbnail/${width}.webp`,
    }));
    return {
        ...file.reference,
        mimeType: "image/png",
        visibility: "public",
        path,
        url: `${origin}${path}`,
        ...(file.derived ? { width: file.dimension, height: file.dimension, variants } : {}),
    };
}

export function fileReadOracle(
    file: StoredRaster,
    origin: string,
    capability: string,
    expected: readonly StoredRaster[],
    offset: number,
) {
    return async (value: unknown) => {
        if (capability === "files.read") {
            assertCondition(
                value instanceof Uint8Array && Buffer.from(value).equals(Buffer.from(file.bytes)),
                "file-byte-body-mismatch",
            );
            return;
        }
        if (capability === "representations.read") {
            assertCondition(value instanceof Uint8Array && value.byteLength > 0, "file-derivative-body-empty");
            const metadata = await new SharpImageTransformer().inspect(value, {
                strict: true,
                maxInputPixels: 512 * 512,
                timeoutMs: 2000,
            });
            assertCondition(
                metadata.width === 64 && metadata.height === 64 && metadata.pages === 1 && metadata.format === "webp",
                "file-derivative-body-mismatch",
            );
            assertCondition(
                file.derivativeBytes && Buffer.from(value).equals(Buffer.from(file.derivativeBytes)),
                "file-derivative-content-mismatch",
            );
            return;
        }
        let wanted: unknown = rasterReference(file, origin);
        if (capability === "files.list") {
            wanted = {
                items: expected.slice(offset, offset + 16).map((entry) => rasterReference(entry, origin)),
                offset,
                limit: 16,
            };
        } else if (capability === "representations.list") {
            const original = rasterReference(file, origin);
            wanted = { original, representations: original.variants };
        }
        assertCondition(
            canonicalizeIJson(requireRecord(value)) === canonicalizeIJson(wanted),
            "file-metadata-or-pagination-mismatch",
        );
    };
}
