import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import {
    ProviderCapabilityDispatchError,
    DefaultProviderCapabilityDispatcher,
    type ProviderCapabilityInvocationContext,
} from "@bernouy/ulvia-provider";
import { registerFileCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia.official",
};

test("file capability failures preserve public errors and hide unexpected failures", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerFileCapabilities(
        dispatcher,
        new CmsFilesService({
            store: new InMemoryCmsFilesStore(),
            blobs: new MemoryBlobStore(),
            signingKey: new Uint8Array(32).fill(7),
            publicBaseUrl: "https://cms.example/site",
        }),
    );

    await expect(invoke(dispatcher, "namespace.get", {})).rejects.toMatchObject({
        code: "INVALID_INPUT",
        status: 422,
    });
    await expect(
        invoke(dispatcher, "upload.write", { uploadId: "missing", uploadToken: "missing" }),
    ).rejects.toMatchObject({
        code: "INVALID_INPUT",
        status: 422,
    });

    const unavailable = new DefaultProviderCapabilityDispatcher();
    registerFileCapabilities(unavailable, {
        async createNamespace() {
            throw new Error("database credentials must remain private");
        },
    } as unknown as CmsFilesService);
    await expect(invoke(unavailable, "namespace.create", { name: "Assets" })).rejects.toEqual(
        new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503),
    );
});

function invoke(
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
): Promise<unknown> {
    return dispatcher.invoke("ulvia.cms.files", capabilityId, input, context);
}
