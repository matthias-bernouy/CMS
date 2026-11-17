import { expect, test } from "bun:test";
import { SharpImageTransformer } from "@bernouy/image-processing/sharp";
import { pngFixture } from "./png";

test("raster fixtures are accepted by the real strict decoder and remain bounded and reproducible", async () => {
    const bytes = pngFixture();
    expect(pngFixture()).toEqual(bytes);
    const metadata = await new SharpImageTransformer().inspect(bytes, {
        strict: true,
        timeoutMs: 1000,
        maxInputPixels: 512 ** 2,
    });
    expect(metadata).toMatchObject({ width: 64, height: 64, pages: 1 });
    expect(() => pngFixture(10000)).toThrow("bounded");
});
