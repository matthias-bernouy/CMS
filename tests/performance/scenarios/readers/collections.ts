import { verifyStoredCollectionReleaseJson } from "@bernouy/repository/collections";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";
import { assertTextChunk, consumeText } from "./continuation";
import type { PreparedSample } from "../../harness/execution/samples";
import type { ReaderContext } from "./context";

export async function prepareCollectionReader(
    context: ReaderContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = await context.collection();
    let first: unknown;
    if (capability === "repository.get") {
        const downloaded = await context.registry("ulvia/repository", "release-download", "http", {
            kind: state.reference.kind,
            publisherId: state.reference.publisherId,
            id: state.reference.id,
            version: state.reference.version,
        });
        assertCondition(downloaded.observation.validated && downloaded.output instanceof Uint8Array);
        const { release } = await verifyStoredCollectionReleaseJson(downloaded.output, state.pin.digest);
        // Independent admitted source is the oracle, not a previous response from the reader under test.
        const expected = JSON.stringify(
            {
                ...release,
                blocs: release.blocs.map((bloc) => ({
                    id: bloc.id,
                    label: bloc.label,
                    description: bloc.description,
                    categories: bloc.categories,
                    catalogue: bloc.catalogue ?? "listed",
                    defaultExample: bloc.defaultExample,
                    requires: bloc.requires,
                })),
            },
            null,
            2,
        );
        const input = { repositoryId: state.pin.repositoryId, reference: state.reference, limit: 1024 };
        return {
            async send() {
                return (
                    await context.call(capability, binding, input, (output) => {
                        const row = requireRecord(output);
                        assertCondition(canonicalizeIJson(row.reference) === canonicalizeIJson(state.reference));
                        assertTextChunk(row, expected, 0, 1024, false);
                        first = row;
                    })
                ).observation;
            },
            async verify() {
                await consumeText(first, expected, 1024, false, (offset) =>
                    context.checked(capability, { ...input, offset }),
                );
                await context.refused(capability, { ...input, offset: expected.length + 1 }, [422]);
                await context.refused(
                    capability,
                    { ...input, reference: { ...state.reference, digest: `sha256:${"0".repeat(64)}` } },
                    [409],
                );
            },
        };
    }
    const listing = capability === "list-collection-releases";
    const input = listing ? { ...state.scope, limit: 1, channel: "all" } : state.pin;
    const assert = (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(row.repositoryId === state.pin.repositoryId && row.collectionId === state.pin.collectionId);
        assertCondition(row.publisherId === state.pin.publisherId);
        if (listing) {
            assertCondition(Array.isArray(row.releases) && row.releases.length > 0 && row.releases.length <= 1);
            assertCondition(row.channel === "all" && typeof row.nextCursor === "string");
        } else {
            assertCondition(row.version === state.pin.version && row.digest === state.pin.digest);
            assertCondition(
                row.blocCount === state.release.blocCount && row.browserRiskDigest === state.release.browserRiskDigest,
            );
        }
        first = row;
    };
    return {
        async send() {
            return (await context.call(capability, binding, input, assert)).observation;
        },
        async verify() {
            if (listing) {
                let page = requireRecord(first);
                const seen = new Set<string>();
                for (let count = 0; ; count++) {
                    assertCondition(count < 128 && Array.isArray(page.releases) && page.releases.length <= 1);
                    for (const value of page.releases) {
                        const row = requireRecord(value);
                        const key = canonicalizeIJson([row.version, row.digest]);
                        assertCondition(row.collectionId === state.pin.collectionId && !seen.has(key));
                        seen.add(key);
                    }
                    if (page.nextCursor === "") {
                        break;
                    }
                    assertCondition(typeof page.nextCursor === "string");
                    page = await context.checked(capability, { ...input, cursor: page.nextCursor });
                }
                assertCondition(seen.has(canonicalizeIJson([state.pin.version, state.pin.digest])));
                await context.invalid(capability, input, { ...input, limit: 0 });
            } else {
                await context.refused(capability, { ...input, digest: `sha256:${"0".repeat(64)}` }, [409]);
            }
        },
    };
}
