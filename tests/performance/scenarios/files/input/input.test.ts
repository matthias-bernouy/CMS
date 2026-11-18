import { expect, test } from "bun:test";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { officialCapabilityInventory } from "../../../capabilities/inventory";
import { pngFixture } from "../../../fixtures/png";
import { FILE_CAPABILITIES } from "../client";
import { fileInput } from "./index";
import type { FileFixture } from "../fixture";

test("every file recipe constructs an exact admitted input before real fixture execution", async () => {
    const inventory = await officialCapabilityInventory();
    const targets = inventory.targets.filter(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.files",
    );
    expect(FILE_CAPABILITIES.map((id): string => id).toSorted()).toEqual(
        targets.map((target) => target.definition.id).toSorted(),
    );
    for (const capability of FILE_CAPABILITIES) {
        const workspace = capability.startsWith("workspace.");
        const state: FileFixture = {
            name: "fixture.png",
            bytes: pngFixture(),
            workspace,
            namespace: { namespaceId: "namespace-a", namespaceKey: "k".repeat(64) },
            credentials: workspace ? {} : { namespaceId: "namespace-a", namespaceKey: "k".repeat(64) },
            key: { keyId: "key-a", namespaceKey: "k".repeat(64) },
            uploadInput: {
                ...(workspace ? {} : { namespaceId: "namespace-a", namespaceKey: "k".repeat(64) }),
                filename: "fixture.png",
                size: pngFixture().byteLength,
                contentType: "image/png",
                visibility: "public",
            },
            upload: { uploadId: "upload-a", uploadToken: "t".repeat(64) },
            file: { fileId: "file-a", generation: "generation-a" },
            representations: null,
            call: async () => {
                throw new Error("Input validation must not invoke a server");
            },
            fixture: async () => {
                throw new Error("Input validation must not mutate a fixture");
            },
            write: async () => null,
            finish: async () => null,
        };
        const target = targets.find((entry) => entry.definition.id === capability)!;
        expect(
            () => validateSchemaValue(target.definition.input, fileInput(state, capability)),
            capability,
        ).not.toThrow();
    }
});
