import { expect, test } from "bun:test";
import { CollectionPublicationRecoveryError } from "@bernouy/cms-repository/repository/authoring";
import type { RepositoryAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { RepositoryRequestError } from "@bernouy/cms-repository/repository/publication";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerAuthoringCapabilities } from "../../../src/capabilities/installations/authoring";
import { resolvedContract, invokeHttp } from "../messages/fixtures";

const id = "c9ddc861-4e76-48cb-8188-7cfa4a94a11d";
const digest = `sha256:${"a".repeat(64)}`;
async function rejectedPublication(failure: Error) {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerAuthoringCapabilities(dispatcher, {
        publish: async () => {
            throw failure;
        },
    } as unknown as RepositoryAuthoring);
    return invokeHttp(await resolvedContract("ulvia/cms.authoring"), dispatcher, "publish-collection", {
        preparationId: id,
        expectedDigest: digest,
    });
}

test.each(["sources-pending", "unknown"] as const)(
    "publication %s survives the admitted wire schema with exact retry instructions",
    async (state) => {
        const response = await rejectedPublication(
            new CollectionPublicationRecoveryError(id, digest, state, {
                cause: new Error("private path and credential diagnostic"),
            }),
        );
        expect(response.status).toBe(503);
        const value = await response.json();
        expect(value.error).toMatchObject({
            code: "CORE_UNAVAILABLE",
            output: { publicationState: state, preparationId: id, digest },
        });
        expect(value.error.output.message).toContain("Retry publish-collection");
        expect(JSON.stringify(value)).not.toContain("private path");
    },
);

test("a typed evolution refusal remains actionable INVALID_INPUT rather than service unavailability", async () => {
    const response = await rejectedPublication(
        new RepositoryRequestError("REJECTED", "Publish a minor version for interface additions.", "minor_required", {
            kind: "bloc",
            id: "community--sample--panel",
        }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({
        code: "INVALID_INPUT",
        output: {
            publicationCode: "minor_required",
            publicationResource: { kind: "bloc", id: "community--sample--panel" },
        },
    });
});

test("source retention refusal preserves the published state without claiming infrastructure unavailability", async () => {
    const response = await rejectedPublication(
        new CollectionPublicationRecoveryError(id, digest, "sources-pending", {
            cause: new RepositoryRequestError("REJECTED", "Source snapshot is immutable"),
        }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatchObject({
        code: "INVALID_INPUT",
        output: { publicationState: "sources-pending", preparationId: id, digest },
    });
});
