import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { MemoryCaptureArtifacts } from "@bernouy/browser-capture";
import { captureImage } from "@bernouy/content/captures";
import { authoringFeature } from "repository/application/authoring/feature";
import type { AuthoringServices } from "repository/application/authoring/interfaces/AuthoringServices";
import { admitCollectionRelease } from "repository/collections/core/admission/admitCollectionRelease";
import { exampleCollection } from "../fixture";

test("prepared example capability returns validated metadata and a private image without publication", async () => {
    const artifact = await admitCollectionRelease(exampleCollection());
    const artifacts = new MemoryCaptureArtifacts();
    let previews = 0;
    const captures = {
        artifacts,
        run: async <Value>(work: () => Promise<Value>) => work(),
        dependencies: async () => [],
        engine: {
            capture: async () => ({
                bytes: new Uint8Array([137, 80, 78, 71]),
                width: 640,
                height: 240,
                browserVersion: "test",
                diagnostics: [],
            }),
        },
    };
    const services = {
        authoring: {
            preview: async () => {
                previews++;
                return artifact;
            },
        },
        authoringCaptures: captures,
    } as unknown as AuthoringServices;
    const context = {
        requestId: "test",
        contractVersion: "1.3.0",
        siteId: "default",
        providerId: "provider",
        actorKind: "administrator" as const,
        subjectId: "admin",
        invocation: { contractId: "ulvia/cms.authoring", instanceId: "instance-a" },
    };
    const input = {
        preparationId: crypto.randomUUID(),
        expectedDigest: artifact.digest,
        exampleId: "assembled",
        previewId: "desktop",
        locale: "fr",
        themeMode: "dark" as const,
        dependencies: [],
    };
    const metadata = await executeCapability(authoringFeature, "capture-prepared-example", {
        services,
        input,
        context,
    });
    expect(metadata.source).toMatchObject({ kind: "prepared-example", releaseDigest: artifact.digest });
    expect(metadata.options).toMatchObject({ width: 640, height: 240, themeMode: "dark" });
    const image = captureImage({ captures: { ...captures } as never }, metadata.captureId, {
        ...context,
        invocation: { ...context.invocation, contractId: "ulvia/cms.content" },
    });
    expect((await image.arrayBuffer()).byteLength).toBe(4);
    expect(previews).toBe(1);
    await expect(
        executeCapability(authoringFeature, "capture-prepared-example", {
            services,
            input: { ...input, exampleId: "missing" },
            context,
        }),
    ).rejects.toThrow();
});
