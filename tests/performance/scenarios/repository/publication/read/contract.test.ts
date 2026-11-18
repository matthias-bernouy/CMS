import { expect, test } from "bun:test";
import { preparePublicationRead } from "./contract";
import { publicationContract } from "../../resources/contract";
import { requireRecord } from "../../../queries/types";
import { inventoryFixture } from "../../../../fixtures/inventory";
import type { publicationFixture } from "../fixture";
import type { QueryEnvironment } from "../../../queries/execute";

test("upload reader preparation uploads before timing and aborts only its own upload on completion or failed priming", async () => {
    const fixture = await inventoryFixture();
    const resource = await publicationContract("performance-upload-read");
    for (const failPrime of [false, true]) {
        const scope = { namespace: resource.namespace, namespaceRevision: 1 };
        const coordinate = {
            kind: "contract",
            publisherId: resource.namespace,
            id: resource.contractId,
            version: resource.version,
        };
        const upload = { uploadId: "owned-upload", expiresAt: "2026-11-19T00:00:00.000Z" };
        const uploadScope = { ...scope, uploadId: upload.uploadId };
        const events: string[] = [];
        let uploaded = false;
        const calls = {
            async call(
                capability: string,
                _binding: string,
                input: Readonly<Record<string, unknown>>,
                assert?: (output: unknown) => void | Promise<void>,
            ) {
                events.push(capability);
                expect(input.uploadId).toBe(upload.uploadId);
                expect(input.namespace).toBe(resource.namespace);
                if (capability === "publication-status") {
                    if (failPrime) {
                        return {
                            observation: { ...fixture.measurement, validated: false, status: 503 },
                            output: undefined,
                        };
                    }
                    const output = { ...upload, uploadedAssetIds: uploaded ? [resource.asset.id] : [] };
                    await assert?.(output);
                    return { observation: fixture.measurement, output };
                }
                if (capability === "publication-asset") {
                    expect(input.bytes).toEqual(resource.bytes);
                    expect(input.contentDigest).toBe(resource.asset.digest);
                    uploaded = true;
                } else {
                    expect(capability).toBe("publication-abort");
                }
                return { observation: fixture.measurement, output: null };
            },
            async checked(capability: string, input: Readonly<Record<string, unknown>>) {
                const result = await this.call(capability, "http", input);
                expect(result.observation.validated).toBe(true);
                return result.output;
            },
            async fixture(capability: string, input: Readonly<Record<string, unknown>>) {
                return requireRecord(await this.checked(capability, input));
            },
        };
        const create: typeof publicationFixture = async () => ({
            ...calls,
            resource,
            coordinate,
            scope,
            source: { ...scope, id: resource.contractId, version: resource.version, kind: "contract" },
            upload,
            uploadScope,
            input: uploadScope,
            committed: false,
        });
        const environment = {} as QueryEnvironment;
        if (failPrime) {
            await expect(
                preparePublicationRead(fixture.inventory, environment, "publication-status", "http", create),
            ).rejects.toThrow("publication-read-prime-failed");
            expect(events).toEqual(["publication-status", "publication-abort"]);
        } else {
            const sample = await preparePublicationRead(
                fixture.inventory,
                environment,
                "publication-status",
                "http",
                create,
            );
            expect(events).toEqual(["publication-status", "publication-asset"]);
            await sample.send();
            await sample.close?.();
            expect(events).toEqual([
                "publication-status",
                "publication-asset",
                "publication-status",
                "publication-abort",
            ]);
        }
    }
});
