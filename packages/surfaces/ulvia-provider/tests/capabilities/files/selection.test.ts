import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { FilesService, CmsFileWorkspace } from "@bernouy/cms-files";

const options = { providerId: "ulvia/primary-provider", scope: { siteId: "site-a", instanceId: "instance-a" } };

test("Files selection requires exact pins and both ports for its complete 27-capability claim", async () => {
    const build = await loadOfficialFeatures();
    const claim = build.implementations.find(({ contractId }) => contractId === "ulvia/cms.files")!;
    expect(
        build.implementedContracts.find(({ release }) => release.contractId === claim.contractId)!.capabilities,
    ).toHaveLength(27);
    for (const services of [{}, { files: {} as FilesService }, { workspace: {} as CmsFileWorkspace }]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(registerOfficialFeatures(dispatcher, services, [claim], options)).rejects.toThrow(
            "Files requires injected files and workspace services",
        );
        dispatcher.seal([]);
    }
    let projections = 0;
    const services = {
        get files(): never {
            projections++;
            throw new Error("Projection must not run");
        },
    };
    const disabled = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(disabled, services, [], options);
    disabled.seal([]);
    const invalid = new DefaultProviderCapabilityDispatcher();
    await expect(
        registerOfficialFeatures(invalid, services, [{ ...claim, digest: `sha256:${"f".repeat(64)}` }], options),
    ).rejects.toThrow();
    invalid.seal([]);
    expect(projections).toBe(0);
});
