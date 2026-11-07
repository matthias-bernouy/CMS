import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { smtpOptions } from "./fixture";

test("the surface shares one compiled feature inventory for releases, manifest claims and mounting", async () => {
    const compilation = compileOfficialFeatures();
    expect(compileOfficialFeatures()).toBe(compilation);
    const build = await compilation;
    const runtime = loadOfficialFeatures();
    expect(loadOfficialFeatures()).toBe(runtime);
    expect((await runtime).implementations).toEqual(build.implementations);
    expect((await runtime).contracts.map(({ canonicalJson }) => canonicalJson)).toEqual(
        build.contracts.map(({ canonicalJson }) => canonicalJson),
    );
    expect(build.contracts.map(({ release }) => release.contractId)).toEqual([
        "ulvia/cms.emailer",
        "ulvia/cms.emailer.smtp",
        "ulvia/cms.secrets",
        "ulvia/cms.files",
    ]);
    expect(build.implementations.map(({ contractId }) => contractId)).toEqual([
        "ulvia/cms.emailer.smtp",
        "ulvia/cms.secrets",
        "ulvia/cms.files",
    ]);
    expect(build.implementedContracts[0]!.capabilities.map(({ definition }) => definition.id).sort()).toEqual([
        "emailer.send",
        "smtp.configuration.get",
        "smtp.configuration.update",
    ]);
});

test("disabled Emailer needs neither services nor execution adapters and mounts no handlers", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, {}, []);
    dispatcher.seal([]);
});

test("SMTP admission is exact and mounting requires its service and host execution policy", async () => {
    const build = await compileOfficialFeatures();
    const smtp = build.implementations.find(({ contractId }) => contractId === "ulvia/cms.emailer.smtp")!;
    let serviceReads = 0;
    const services = {
        get emailer(): never {
            serviceReads++;
            throw new Error("Service projection must not run for unapproved releases");
        },
    };
    for (const implementations of [
        [{ ...smtp, version: "1.1.0" }],
        [{ ...smtp, digest: `sha256:${"0".repeat(64)}` }],
        [smtp, smtp],
    ]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(registerOfficialFeatures(dispatcher, services, implementations, smtpOptions())).rejects.toThrow();
        dispatcher.seal([]);
    }
    expect(serviceReads).toBe(0);
    for (const options of [undefined, smtpOptions()]) {
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        await expect(registerOfficialFeatures(dispatcher, {}, [smtp], options)).rejects.toThrow(
            options ? "injected emailer" : "exact scope",
        );
        dispatcher.seal([]);
    }
});
