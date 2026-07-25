import { describe, expect, test } from "bun:test";
import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import { probeCommerceImage } from "../../../../integrations/domains/commerce/versions/1.0.0/connectors/supabase/functions/cms-commerce/routes/catalog/media/probe/index";
import {
    animatedAvifBytes,
    animatedGifBytes,
    animatedPngBytes,
    animatedWebpBytes,
    avifBytes,
    gifBytes,
    jpegBytes,
    orientedAvifBytes,
    orientedPngBytes,
    orientedWebpBytes,
    pngBytes,
    pngWithAncillaryBytes,
    webpBytes,
} from "./fixtures";

describe("Commerce image format probing", () => {
    for (const fixture of [
        { label: "JPEG", bytes: jpegBytes, mimeType: "image/jpeg", extension: ".jpg" },
        { label: "PNG", bytes: pngBytes, mimeType: "image/png", extension: ".png" },
        { label: "WebP", bytes: webpBytes, mimeType: "image/webp", extension: ".webp" },
        { label: "GIF", bytes: gifBytes, mimeType: "image/gif", extension: ".gif" },
        { label: "AVIF", bytes: avifBytes, mimeType: "image/avif", extension: ".avif" },
    ]) {
        test(`detects a complete ${fixture.label} from bytes and reports intrinsic dimensions`, () => {
            expect(probeCommerceImage(fixture.bytes())).toEqual({
                width: fixture.label === "PNG" ? 320 : 3,
                height: fixture.label === "PNG" ? 200 : 2,
                mimeType: fixture.mimeType,
                extension: fixture.extension,
            });
        });
    }

    test("reports display-oriented JPEG dimensions", () => {
        expect(probeCommerceImage(jpegBytes(6))).toMatchObject({
            width: 2,
            height: 3,
        });
    });

    test("reports PNG eXIf dimensions matching the Sharp rotate pipeline", async () => {
        const source = orientedPngBytes();
        const detected = probeCommerceImage(source);
        const transformer = new SharpSourceImageTransformer();
        const inspected = await transformer.inspect(source, SOURCE_RESPONSIVE_WEBP_V1);
        const transformed = await transformer.transform(source, {
            width: 8,
            recipe: SOURCE_RESPONSIVE_WEBP_V1,
        });

        expect(detected).toMatchObject({ width: 8, height: 12 });
        expect(inspected).toMatchObject({ width: detected.width, height: detected.height });
        expect(transformed).toMatchObject({ width: detected.width, height: detected.height });
    });

    test.each([
        ["WebP", orientedWebpBytes],
        ["AVIF", orientedAvifBytes],
    ])("reports display-oriented %s dimensions", (_label, fixture) => {
        expect(probeCommerceImage(fixture())).toMatchObject({
            width: 8,
            height: 12,
        });
    });

    test("rejects an unsupported signature instead of trusting a declared MIME", () => {
        expect(() => probeCommerceImage(new TextEncoder().encode("<svg/>"))).toThrow(
            "file must be a JPEG, PNG, WebP, GIF, or AVIF image",
        );
    });

    test("rejects zero dimensions and the 40 MP pixel envelope", () => {
        expect(() => probeCommerceImage(pngBytes(0, 200))).toThrow("image dimensions are invalid or too large");
        expect(probeCommerceImage(pngBytes(10_000, 4_000))).toMatchObject({ width: 10_000, height: 4_000 });
        expect(() => probeCommerceImage(pngBytes(10_000, 5_000))).toThrow("image dimensions are invalid or too large");
    });

    test("validates CRC32 across a large bounded PNG chunk", () => {
        const source = pngWithAncillaryBytes(1024 * 1024);
        expect(probeCommerceImage(source)).toMatchObject({ width: 320, height: 200 });

        const corrupted = source.slice();
        corrupted[Math.floor(corrupted.length / 2)]! ^= 1;
        expect(() => probeCommerceImage(corrupted)).toThrow();
    });

    test("rejects truncated and structurally invalid AVIF boxes", () => {
        expect(() => probeCommerceImage(avifBytes().subarray(0, 28))).toThrow();
        const impossibleBox = avifBytes();
        impossibleBox.set([0xff, 0xff, 0xff, 0xff], 0);
        expect(() => probeCommerceImage(impossibleBox)).toThrow();
    });

    test.each([
        ["JPEG", jpegBytes],
        ["PNG", pngBytes],
        ["WebP", webpBytes],
        ["GIF", gifBytes],
        ["AVIF", avifBytes],
    ])("rejects a truncated %s container", (_label, fixture) => {
        const bytes = fixture();
        expect(() => probeCommerceImage(bytes.subarray(0, bytes.length - 1))).toThrow();
    });

    test.each([
        ["PNG", animatedPngBytes],
        ["GIF", animatedGifBytes],
        ["WebP", animatedWebpBytes],
        ["AVIF", animatedAvifBytes],
    ])("rejects animated %s uploads", (_label, fixture) => {
        expect(() => probeCommerceImage(fixture())).toThrow("animated images are not supported");
    });
});
