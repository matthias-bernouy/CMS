import { expect, test } from "bun:test";
import {
    compileOfficialFeatures,
    compileOfficialManifest,
    compileRetainedFeatures,
} from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";

// Reviewed current releases; historical execution compatibility is verified separately.
const releaseDigests = {
    "ulvia/cms.emailer": "sha256:a235f01b1fec08716ea722caccc6bc56974b15e449b2f41b0559e4ea686b70ed",
    "ulvia/cms.emailer.smtp": "sha256:ae8b92cd8a685c163229e1c2326c6a687546dd2488dc88a4295eff30e6b256c1",
    "ulvia/cms.access": "sha256:da46389a522b67efc617c090109ff2b3c6050a3f9d79ef05a556477d37a28053",
    "ulvia/cms.content": "sha256:3aac9d6c0b8e19ea6d055d8453f6d0f4cf2330335a522efa7a328c8f532e80a8",
    "ulvia/cms.authoring": "sha256:aed49f5287efa5fe4c7caed68515a4d7a66411ba0893403cd19bfbc0e4499abc",
    "ulvia/cms.secrets": "sha256:358b2e7e889f656320dd824a698c425a500211ea80695d120e5f4effe1255c08",
    "ulvia/cms.files": "sha256:f5be7d20f375d96cc97d4454bdb570fc87fabe755dff1850cbaeb26e508809a8",
    "ulvia/cms.observability": "sha256:113758c81e4cdc774bba95c8f136a3a9650be5b6d59412ef51383bd15dd2de45",
    "ulvia/provider.connections": "sha256:0cfc85a809d4078e5e95adc94d023d65fa6d626074093f1a880090ce02b8f9f2",
    "ulvia/repository": "sha256:216131fbd6fa34c015c8dbdb1e1954d6217ba7b85e44d6f51d137d5b21979409",
    "ulvia/cms.hosting": "sha256:89bfdbd3cbc8e66b334f2e93986008185036118d217dd76837433bc3a4b10d66",
    "ulvia/cms.installations": "sha256:4d37e1ef5dff76b3833d4f555f21cb4d99ede2c5bb8b9822e0ec909e5d12449c",
    "ulvia/provider.tls": "sha256:41dbd3a81aa4d4d6eea2053c5dc7f097ac7003cd683a0c86341fbc4fb5bafa01",
    "ulvia/provider.routing": "sha256:0e312b93bdd939df59e4b837aba02be5f0b750485cf88db41fcec0411cdd9437",
    "ulvia/provider.cms-instances": "sha256:789d38661b21df1db1b36f4c616aa21c5d3456d235c5ee85555c1691b4f80f1b",
} as const;

test("SDK definitions preserve every released schema, mock, binding, document digest and parent pin", async () => {
    const compiled = await compileOfficialFeatures();
    expect(Object.fromEntries(compiled.contracts.map(({ release, digest }) => [release.contractId, digest]))).toEqual(
        releaseDigests,
    );
});

test("generated manifest claims the exact SDK implementation inventory", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    const compiled = await compileOfficialFeatures();
    await publishContractSet(catalogue, compiled.contracts);
    const manifest = await compileOfficialManifest(catalogue, compiled);
    expect(manifest.manifest.implementations).toHaveLength(13);
    for (const implementation of manifest.manifest.implementations) {
        expect(implementation.digest).toBe(releaseDigests[implementation.contractId as keyof typeof releaseDigests]);
    }
});

test("Hosting 1.0 remains executable with its eight exact capabilities before explicit upgrade", async () => {
    const builds = await compileRetainedFeatures();
    const hosting = builds.find((build) =>
        build.implementations.some((pin) => pin.contractId === "ulvia/cms.hosting" && pin.version === "1.0.0"),
    );
    expect(hosting).toBeDefined();
    expect(hosting!.implementations[0]!.digest).toBe(
        "sha256:afa1b95ffb2cb7c23f3c233bb195cdeb0bb9026abfd0df933a9ff2798c99144c",
    );
    expect(hosting!.contracts[0]!.release.capabilities).toHaveLength(8);
    expect(hosting!.contracts[0]!.release.capabilities.some(({ id }) => id.startsWith("zones."))).toBe(false);
});

test("prior Content, Repository, Authoring and Installations releases retain exact execution pins before explicit upgrades", async () => {
    const builds = await compileRetainedFeatures();
    for (const [contractId, version, digest] of [
        ["ulvia/cms.content", "1.1.0", "sha256:4191a38c7c20104b78cf0340354b194f00e183dbd71e75a3a5eb4e4e13d13353"],
        ["ulvia/repository", "1.2.0", "sha256:fc0cff55733f2bd4f4ce77871ccb95893793f9a8f4965cf47bd31bf4c1cea6a2"],
        ["ulvia/cms.installations", "1.4.0", "sha256:dbfaafe02234c64828b1fc8b0ced559a6ec75ebe185db6ade639def9edcd876f"],
        ["ulvia/cms.installations", "1.4.2", "sha256:59f764502bde4b642609b6bd4d0cf3b7d0ba58444972cb48027a8b1ddb2acdf1"],
        ["ulvia/cms.installations", "1.4.1", "sha256:0909a87318692b8753c9931955ea98816cce8256dc0eb185787b525d3c597754"],
        ["ulvia/cms.authoring", "1.2.0", "sha256:040e4e0346f615f592d46d1cbe685958074afa2f65f9d833a972f45bbda981e4"],
        ["ulvia/cms.authoring", "1.2.1", "sha256:33a8ba7cd237c000bb3aea507298268525a976253f06517cea0817e178b09b0d"],
        ["ulvia/cms.authoring", "1.2.2", "sha256:a29e5ae5aaf28677e1c9158fabefd6b1f26285bd4ea39e48612d3daa48a9be8c"],
    ] as const) {
        const retained = builds.find((build) =>
            build.implementations.some((pin) => pin.contractId === contractId && pin.version === version),
        );
        expect(retained).toBeDefined();
        expect(retained!.contracts[0]!.digest).toBe(digest);
    }
});

test("Installations 1.5 retains every 1.4.2 capability byte for byte and adds only two control queries", async () => {
    const current = (await compileOfficialFeatures()).contracts.find(
        ({ release }) => release.contractId === "ulvia/cms.installations",
    )!;
    const retained = (await compileRetainedFeatures()).find((build) =>
        build.implementations.some((pin) => pin.contractId === "ulvia/cms.installations" && pin.version === "1.4.2"),
    )!;
    const previous = retained.contracts.find(({ release }) => release.contractId === "ulvia/cms.installations")!;
    expect(previous.digest).toBe("sha256:59f764502bde4b642609b6bd4d0cf3b7d0ba58444972cb48027a8b1ddb2acdf1");
    expect(current.release.version).toBe("1.5.0");
    const oldIds = new Set(previous.release.capabilities.map(({ id }) => id));
    expect(current.release.capabilities.filter(({ id }) => oldIds.has(id))).toEqual([...previous.release.capabilities]);
    expect(
        current.release.capabilities
            .filter(({ id }) => !oldIds.has(id))
            .map(({ id }) => id)
            .sort(),
    ).toEqual(["gateway.mcp.resolve", "gateway.route.snapshot"]);
});
