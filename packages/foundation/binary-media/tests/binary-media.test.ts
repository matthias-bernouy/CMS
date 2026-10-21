import { describe, expect, test } from "bun:test";
import {
    binaryRepresentationFingerprint,
    detectMediaSignature,
    isSha256Digest,
    mediaTypeIssue,
    sha256Digest,
    sha256Hex,
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

    test("computes and recognizes canonical SHA-256 digests", async () => {
        const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        const bytes = new TextEncoder().encode("abc");
        expect(await sha256Hex(bytes)).toBe(expected);
        expect(await sha256Digest(bytes)).toBe(`sha256:${expected}`);
        expect(isSha256Digest(`sha256:${expected}`)).toBe(true);
        for (const value of [
            null,
            1,
            "sha256:",
            "sha256:bad",
            `sha256:${"a".repeat(63)}`,
            `sha256:${"a".repeat(65)}`,
            `sha256:${"A".repeat(64)}`,
            `sha256:${"g".repeat(64)}`,
            `sha256:${"a".repeat(63)}/`,
        ]) {
            expect(isSha256Digest(value)).toBe(false);
        }
    });

    test("rejects invalid representation fingerprint inputs without changing the valid format", () => {
        const digest = `sha256:${"a".repeat(64)}` as const;
        expect(binaryRepresentationFingerprint({ digest, byteLength: 3, mediaType: "application/octet-stream" })).toBe(
            `v1-${"a".repeat(64)}-3-6170706c69636174696f6e2f6f637465742d73747265616d`,
        );
        expect(() =>
            binaryRepresentationFingerprint({ digest: "sha256:bad", byteLength: 3, mediaType: "text/plain" }),
        ).toThrow(TypeError);
        for (const byteLength of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => binaryRepresentationFingerprint({ digest, byteLength, mediaType: "text/plain" })).toThrow(
                RangeError,
            );
        }
    });
});
