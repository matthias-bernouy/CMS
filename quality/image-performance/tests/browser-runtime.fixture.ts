import { SOURCE_RESPONSIVE_WEBP_V1 } from "@bernouy/cms-source-images";
import { SharpSourceImageTransformer } from "@bernouy/cms-source-images/sharp";
import { startBrowserFixtureServer } from "../browser/server";

const server = await startBrowserFixtureServer();
try {
    const original = await fetch(`${server.origin}/image/original.png?slot=baseline`);
    const derivative = await fetch(`${server.origin}/image/original.png?slot=candidate&cms-width=384`);
    const transformer = new SharpSourceImageTransformer();
    const originalMetadata = await transformer.inspect(
        new Uint8Array(await original.arrayBuffer()),
        SOURCE_RESPONSIVE_WEBP_V1,
    );
    const derivativeMetadata = await transformer.inspect(
        new Uint8Array(await derivative.arrayBuffer()),
        SOURCE_RESPONSIVE_WEBP_V1,
    );

    assertEqual(original.headers.get("content-type"), "image/png", "original content type");
    assertMetadata(originalMetadata, { format: "png", width: 1_600, height: 1_200 });
    assertEqual(derivative.headers.get("content-type"), "image/webp", "derivative content type");
    assertMetadata(derivativeMetadata, { format: "webp", width: 384, height: 288 });
    assertEqual(server.adapter.name, "source-responsive-webp-v1-local-fs", "adapter name");
    assertEqual(server.adapter.implementation.mode, "source-image", "adapter mode");
    assertEqual(server.adapter.implementation.recipeId, SOURCE_RESPONSIVE_WEBP_V1.id, "recipe id");
    assertEqual(server.adapter.implementation.encoderIdentity, transformer.encoderIdentity, "encoder identity");
    assertEqual(
        JSON.stringify(server.requests),
        JSON.stringify(["/image/original.png?slot=baseline", "/image/original.png?slot=candidate&cms-width=384"]),
        "request sequence",
    );
} finally {
    await server.stop();
}

function assertMetadata(
    actual: Readonly<{ format?: string; width: number; height: number }>,
    expected: Readonly<{ format: string; width: number; height: number }>,
): void {
    assertEqual(actual.format, expected.format, "image format");
    assertEqual(actual.width, expected.width, "image width");
    assertEqual(actual.height, expected.height, "image height");
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
    if (actual !== expected) {
        throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
    }
}
