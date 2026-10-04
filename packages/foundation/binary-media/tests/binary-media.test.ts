import { describe, expect, test } from "bun:test";
import {
    binaryRepresentationFingerprint,
    detectMediaSignature,
    mediaTypeIssue,
    sha256Digest,
    snapshotBinary,
} from "../src/exports";

describe("binary media primitives", () => {
    test("snapshots mutable byte inputs and derives stable identities", async () => {
        const input = new Uint8Array([1, 2, 3]);
        const snapshot = snapshotBinary(input);
        input[0] = 9;
        const bytes = new Uint8Array(await snapshot.arrayBuffer());
        expect([...bytes]).toEqual([1, 2, 3]);
        const digest = await sha256Digest(bytes);
        expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(
            binaryRepresentationFingerprint({ digest, byteLength: 3, mediaType: "application/octet-stream" }),
        ).toMatch(/^v1-[0-9a-f]{64}-3-[0-9a-f]+$/);
    });

    test("recognizes signatures and rejects an unsupported ISO base media brand", () => {
        expect(detectMediaSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.label).toBe(
            "image/png",
        );
        const heic = new Uint8Array(20);
        heic.set(new TextEncoder().encode("ftyp"), 4);
        heic.set(new TextEncoder().encode("heic"), 8);
        expect(mediaTypeIssue("video/mp4", heic)).toContain("unsupported ISO base media");
        expect(mediaTypeIssue("application/octet-stream", heic)).toBeNull();
        expect(mediaTypeIssue("image/png", new Uint8Array([1, 2, 3]))).toContain("binary signature");
    });
});
