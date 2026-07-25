import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { SOURCE_IMAGE_WIDTHS, SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import { ANIMATED_GIF, orientedJpeg, solidImage } from "../helpers/sharpFixtures";

describe("SharpSourceImageTransformer", () => {
    test.each(["jpeg", "png", "webp", "avif"] as const)("inspects supported %s input", async (format) => {
        const transformer = new SharpSourceImageTransformer();
        const metadata = await transformer.inspect(await solidImage(format), SOURCE_RESPONSIVE_WEBP_V1);
        expect(metadata).toMatchObject({ format, width: 96, height: 64, pages: 1 });
    });

    test("produces a valid exact-width WebP for every recipe rung", async () => {
        const transformer = new SharpSourceImageTransformer();
        const source = await solidImage("png", 2_600, 1_300);
        for (const width of SOURCE_IMAGE_WIDTHS) {
            const result = await transformer.transform(source, {
                width,
                recipe: SOURCE_RESPONSIVE_WEBP_V1,
            });
            const metadata = await sharp(result.bytes).metadata();
            expect(metadata.format).toBe("webp");
            expect(result.width).toBe(width);
            expect(metadata.width).toBe(width);
            expect(result.height).toBe(width / 2);
            expect(metadata.height).toBe(width / 2);
        }
    }, 30_000);

    test("applies EXIF orientation before sizing", async () => {
        const transformer = new SharpSourceImageTransformer();
        const source = await orientedJpeg();
        const inspected = await transformer.inspect(source, SOURCE_RESPONSIVE_WEBP_V1);
        expect(inspected).toMatchObject({ width: 40, height: 80 });
        const result = await transformer.transform(source, {
            width: 40,
            recipe: SOURCE_RESPONSIVE_WEBP_V1,
        });
        expect(result).toMatchObject({ width: 40, height: 80 });
    });

    test("does not upscale and strips metadata while emitting sRGB", async () => {
        const transformer = new SharpSourceImageTransformer();
        const source = await orientedJpeg();
        const result = await transformer.transform(source, {
            width: 128,
            recipe: SOURCE_RESPONSIVE_WEBP_V1,
        });
        const metadata = await sharp(result.bytes).metadata();
        expect(result.width).toBe(40);
        expect(result.height).toBe(80);
        expect(metadata.space).toBe("srgb");
        expect(metadata.orientation).toBeUndefined();
        expect(metadata.exif).toBeUndefined();
        expect(metadata.icc).toBeUndefined();
    });

    test("reports multiple pages so core can reject animation", async () => {
        const transformer = new SharpSourceImageTransformer();
        const metadata = await transformer.inspect(ANIMATED_GIF, SOURCE_RESPONSIVE_WEBP_V1);
        expect(metadata.format).toBe("gif");
        expect(metadata.pages).toBeGreaterThan(1);
    });

    test("rejects SVG and corrupt input", async () => {
        const transformer = new SharpSourceImageTransformer();
        await expect(
            transformer.inspect(
                new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
                SOURCE_RESPONSIVE_WEBP_V1,
            ),
        ).rejects.toThrow();
        const png = await solidImage("png");
        await expect(transformer.inspect(png.subarray(0, 20), SOURCE_RESPONSIVE_WEBP_V1)).rejects.toThrow();
    });

    test("applies limitInputPixels at decoder construction", async () => {
        const transformer = new SharpSourceImageTransformer();
        const source = await solidImage("png", 100, 100);
        await expect(
            transformer.inspect(source, { ...SOURCE_RESPONSIVE_WEBP_V1, maxInputPixels: 9_999 }),
        ).rejects.toThrow(/pixel limit/i);
    });

    test("encoder identity includes concrete Sharp and libvips versions", () => {
        const identity = new SharpSourceImageTransformer().encoderIdentity;
        expect(identity).toStartWith("sharp-");
        expect(identity).toContain("-vips-");
        expect(identity).toContain("-webp-");
    });
});
