import { assertCondition } from "../../../../queries/types";
import { collectionPin } from "../resources/expected";
import { nextCollectionReadCoordinate } from "../resources/collection";
import { assertInstalledRows, assertInstalledDetail } from "./installed";
import { assertAvailableCollections } from "./available";
import { assertCollectionPage, assertReleaseReview } from "./metadata";
import { collectionPageInput, verifyCollectionPages } from "./pages";
import { verifyCollectionReadBoundary } from "./negative";
import type { CollectionReadState } from "../context/types";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";
import type { PreparedSample } from "../../../../../harness/execution/samples";

export async function prepareCollectionRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    state: CollectionReadState,
    capability: string,
    binding: string,
    profile: string,
    index: number,
): Promise<PreparedSample> {
    await state.tenant.prepare();
    const paged = capability === "list-collection-catalogue" || capability === "list-collection-releases";
    const history = capability === "list-collection-releases";
    const detail = capability === "get-collection-details" || capability === "get-collection-installation";
    const installed = capability === "list-installed-collections" || capability === "list-collection-installations";
    let resource = state.installed.get(state.resources[0]!.id)!;
    let request: Readonly<Record<string, unknown>> = detail
        ? { collectionId: resource.id }
        : capability === "get-collection-release"
          ? collectionPin(resource, state.repositoryId)
          : capability === "list-available-collections"
            ? { channel: "stable" }
            : {};
    const page = paged ? await collectionPageInput(state, history, profile, index) : undefined;
    if (page) {
        request = page.input;
    }
    const oracle = (output: unknown) => {
        if (detail) {
            assertInstalledDetail(output, state);
        } else if (installed) {
            assertInstalledRows(output, state);
        } else if (page) {
            assertCollectionPage(output, state, history, page.offset, 16);
        } else if (capability === "list-available-collections") {
            assertAvailableCollections(output, state);
        } else {
            assertReleaseReview(output, state, resource);
        }
    };
    if (profile === "invalidation") {
        const coordinate = nextCollectionReadCoordinate(state.resources, installed);
        const next = detail ? undefined : await state.create(coordinate.index, coordinate.patch);
        if (capability === "get-collection-release") {
            await state.publish(next!);
            resource = next!;
            request = collectionPin(resource, state.repositoryId);
        }
        const prime = await state.tenant.client("ulvia/cms.installations", capability, binding, request, oracle);
        assertCondition(prime.observation.validated, "collection-read-old-state-primed");
        if (detail) {
            await state.configure(`Measured configuration ${index}`);
        } else if (capability === "get-collection-release") {
            await state.upgrade(resource);
        } else {
            await state.publish(next!);
            if (installed) {
                await state.install([next!]);
            }
        }
    }
    return {
        async send() {
            return (await state.tenant.client("ulvia/cms.installations", capability, binding, request, oracle))
                .observation;
        },
        async verify() {
            await verifyCollectionReadBoundary(inventory, environment, state, capability, request);
            if (paged && (index === 0 || index === 9 || profile === "invalidation")) {
                await verifyCollectionPages(state, history);
            }
        },
    };
}
