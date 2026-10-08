import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import {
    CoreCapabilityDispatchError,
    DefaultCoreCapabilityDispatcher,
    type CoreCapabilityInvocationContext,
} from "@bernouy/cms-core";
import { registerFileCapabilities } from "@bernouy/cms-core/capabilities";

const context: CoreCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "site-a",
    installationId: "install-a",
    origin: "control",
    actorKind: "administrator",
};

test("file capability failures preserve public errors and hide unexpected failures", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
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

    const unavailable = new DefaultCoreCapabilityDispatcher();
    registerFileCapabilities(unavailable, {
        async createNamespace() {
            throw new Error("database credentials must remain private");
        },
    } as unknown as CmsFilesService);
    await expect(invoke(unavailable, "namespace.create", { name: "Assets" })).rejects.toEqual(
        new CoreCapabilityDispatchError("CORE_UNAVAILABLE", 503),
    );
});

function invoke(
    dispatcher: DefaultCoreCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
): Promise<unknown> {
    return dispatcher.invoke("ulvia.cms.files", capabilityId, input, context);
}
