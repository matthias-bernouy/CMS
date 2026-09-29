import { expect, test } from "bun:test";
import sharp from "sharp";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";

test("default profile preserves the CMS file variant encoder output", async () => {
    const source = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
        .png()
        .toBuffer();
    const expected = await sharp(source)
        .resize({ width: 200, withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    const result = await new SharpImageTransformer().transform(source, { width: 200, quality: 75 });
    expect(result.bytes).toEqual(new Uint8Array(expected));
    expect([result.width, result.height]).toEqual([200, 150]);
});

test("gateway profile normalizes orientation and enforces decode bounds", async () => {
    const source = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 200 } },
    })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
    const transformer = new SharpImageTransformer();
    expect(await transformer.inspect(source, { strict: true })).toMatchObject({ width: 300, height: 400 });
    const result = await transformer.transform(source, {
        width: 150,
        quality: 75,
        maxInputPixels: 200_000,
        timeoutMs: 5_000,
        strict: true,
        autoOrient: true,
        colourspace: "srgb",
    });
    expect([result.width, result.height]).toEqual([150, 200]);
    await expect(transformer.inspect(source, { maxInputPixels: 100 })).rejects.toThrow();
});
