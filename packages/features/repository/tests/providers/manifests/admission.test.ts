import { describe, expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";
import { admitProviderManifest, admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { contractDocument, implementation, manifestDocument, releaseCatalogue, requirement } from "../support/fixtures";

const contractFixture = new URL(
    "../../../../../platform/contracts/fixtures/protocol-v1/representative.contract.json",
    import.meta.url,
);
const manifestFixture = new URL(
    "../../../../../platform/providers/fixtures/protocol-v1/example.provider-manifest.json",
    import.meta.url,
);

describe("provider manifest admission", () => {
    test("admits the representative manifest with an immutable golden digest", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(JSON.parse(await Bun.file(contractFixture).text())));
        await catalogue.publish(
            await admitContractRelease(contractDocument("ulvia/communication.email", "email.message.send")),
        );

        const admitted = await admitProviderManifestJson(await Bun.file(manifestFixture).text(), catalogue);

        expect(admitted.kind).toBe("admitted-provider-manifest");
        expect(admitted.manifest.implementations[0]?.contractId).toBe("ulvia/protocol.examples");
        expect(admitted.digest).toBe("sha256:b87cac6625f940fd5181da80164c4b9b6a2fd2ad697f156b4b1c41281aca4bc2");
        expect(Object.isFrozen(admitted.manifest)).toBe(true);
    });

    test("requires an exact published implementation digest", async () => {
        const contractSource = contractDocument("ulvia/communication.email", "email.message.send");
        const contract = await admitContractRelease(contractSource);
        const catalogue = await releaseCatalogue(contractSource);
        const document = manifestDocument([
            implementation("ulvia/communication.email", "1.0.0", `sha256:${"0".repeat(64)}`),
        ]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("version and digest do not resolve");
    });

    test("resolves every required capability and version range", async () => {
        const contractSource = contractDocument("ulvia/forms.submission", "form.submission.create");
        const contract = await admitContractRelease(contractSource);
        const catalogue = await releaseCatalogue(contractSource);
        const document = manifestDocument([
            implementation("ulvia/forms.submission", "1.0.0", contract.digest, [
                requirement("ulvia/communication.email", "email.message.send"),
            ]),
        ]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow(
            "no non-yanked ulvia/communication.email",
        );
    });

    test("does not resolve a stable range through the next release prerelease", async () => {
        const implementationSource = contractDocument("ulvia/forms.submission", "form.submission.create");
        const dependencySource = contractDocument("ulvia/communication.email", "email.message.send", "2.0.0-alpha.1");
        const implementationRelease = await admitContractRelease(implementationSource);
        const catalogue = await releaseCatalogue(implementationSource, dependencySource);
        const document = manifestDocument([
            implementation("ulvia/forms.submission", "1.0.0", implementationRelease.digest, [
                requirement("ulvia/communication.email", "email.message.send", "^1.0.0"),
            ]),
        ]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow(
            "no non-yanked ulvia/communication.email",
        );
    });

    test("rejects cycles between implemented contract requirements", async () => {
        const firstSource = contractDocument("ulvia/domain.first", "first.run");
        const secondSource = contractDocument("ulvia/domain.second", "second.run");
        const first = await admitContractRelease(firstSource);
        const second = await admitContractRelease(secondSource);
        const catalogue = await releaseCatalogue(firstSource, secondSource);
        const document = manifestDocument([
            implementation("ulvia/domain.first", "1.0.0", first.digest, [
                requirement("ulvia/domain.second", "second.run"),
            ]),
            implementation("ulvia/domain.second", "1.0.0", second.digest, [
                requirement("ulvia/domain.first", "first.run"),
            ]),
        ]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("requirements contain a cycle");
    });

    test("allows a deprecated release even after its informational sunset date", async () => {
        const contractSource = contractDocument("ulvia/communication.email", "email.message.send");
        const contract = await admitContractRelease(contractSource);
        const catalogue = await releaseCatalogue(contractSource);
        await catalogue.setDeprecation("ulvia/communication.email", "1.0.0", {
            sunsetAt: "2020-01-01T00:00:00Z",
        });
        const document = manifestDocument([implementation("ulvia/communication.email", "1.0.0", contract.digest)]);

        await expect(admitProviderManifest(document, catalogue)).resolves.toMatchObject({
            kind: "admitted-provider-manifest",
        });
    });

    test("rejects yanked implemented releases", async () => {
        const contractSource = contractDocument("ulvia/communication.email", "email.message.send");
        const contract = await admitContractRelease(contractSource);
        const catalogue = await releaseCatalogue(contractSource);
        await catalogue.setYank("ulvia/communication.email", "1.0.0", { reason: "Known protocol defect" });
        const document = manifestDocument([implementation("ulvia/communication.email", "1.0.0", contract.digest)]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow("cannot implement a yanked");
    });

    test("does not resolve requirements through a yanked release", async () => {
        const implementationSource = contractDocument("ulvia/forms.submission", "form.submission.create");
        const dependencySource = contractDocument("ulvia/communication.email", "email.message.send");
        const implementationRelease = await admitContractRelease(implementationSource);
        const catalogue = await releaseCatalogue(implementationSource, dependencySource);
        await catalogue.setYank("ulvia/communication.email", "1.0.0", { reason: "Known protocol defect" });
        const document = manifestDocument([
            implementation("ulvia/forms.submission", "1.0.0", implementationRelease.digest, [
                requirement("ulvia/communication.email", "email.message.send"),
            ]),
        ]);

        await expect(admitProviderManifest(document, catalogue)).rejects.toThrow(
            "no non-yanked ulvia/communication.email",
        );
    });
});
