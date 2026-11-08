import { expect, test } from "bun:test";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";

// Reviewed current releases; historical execution compatibility is verified separately.
const releaseDigests = {
    "ulvia/cms.emailer": "sha256:a235f01b1fec08716ea722caccc6bc56974b15e449b2f41b0559e4ea686b70ed",
    "ulvia/cms.emailer.smtp": "sha256:ae8b92cd8a685c163229e1c2326c6a687546dd2488dc88a4295eff30e6b256c1",
    "ulvia/cms.access": "sha256:da46389a522b67efc617c090109ff2b3c6050a3f9d79ef05a556477d37a28053",
    "ulvia/cms.content": "sha256:2e8ed4c91f830c0896d9a44062a7eb4badb5a61d2afd71e3ab6e62d525bbc961",
    "ulvia/cms.authoring": "sha256:454926be86079d930dc811bb60d5abde818fa8e03dd9d92374f6b33fc94df891",
    "ulvia/cms.secrets": "sha256:358b2e7e889f656320dd824a698c425a500211ea80695d120e5f4effe1255c08",
    "ulvia/cms.files": "sha256:f5be7d20f375d96cc97d4454bdb570fc87fabe755dff1850cbaeb26e508809a8",
    "ulvia/cms.observability": "sha256:113758c81e4cdc774bba95c8f136a3a9650be5b6d59412ef51383bd15dd2de45",
    "ulvia/provider.connections": "sha256:0cfc85a809d4078e5e95adc94d023d65fa6d626074093f1a880090ce02b8f9f2",
    "ulvia/repository": "sha256:6c459684fb72e50e8e8093e74563c3f111d3f007639df12d5ad09379c2f834ef",
    "ulvia/cms.installations": "sha256:b03756c83c522da525803d72eadee171cbb4153b9f6d5881efbf23798f6ea745",
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
    expect(manifest.manifest.implementations).toHaveLength(10);
    for (const implementation of manifest.manifest.implementations) {
        expect(implementation.digest).toBe(releaseDigests[implementation.contractId as keyof typeof releaseDigests]);
    }
});
