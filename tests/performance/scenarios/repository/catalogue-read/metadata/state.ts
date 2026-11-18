import { assertCondition, requireRecord } from "../../../queries/types";
import { assertPublicationState } from "../../publication/read/oracles";
import type { PublicKind, PublishedResource, PublicResourceFactory, RegistryReadPorts } from "./types";

export function registryDiscoveryState(
    namespace: string,
    namespaceRevision: unknown,
    owner: RegistryReadPorts,
    read: RegistryReadPorts,
    create: PublicResourceFactory,
    kinds: readonly PublicKind[],
) {
    const published: PublishedResource[] = [];
    const scope = { namespace, namespaceRevision };
    const coordinate = (row: PublishedResource) => {
        const { digest: _digest, ...value } = row.reference;
        return value;
    };
    const publish = async (kind: PublicKind, index: number, patch: number) => {
        assertCondition(published.length < 192, "registry-discovery-publication-bound");
        const resource = await create(kind, index, patch);
        const startedAt = Date.now();
        const upload = await owner.fixture("publication-begin", { ...scope, manifest: resource.manifest });
        const input = { ...scope, uploadId: upload.uploadId };
        for (const asset of resource.assets) {
            await owner.checked("publication-asset", {
                ...input,
                assetId: asset.id,
                bytes: asset.bytes,
                contentDigest: asset.digest,
            });
        }
        const receipt = await owner.fixture("publication-commit", input);
        assertCondition(
            receipt.digest === resource.reference.digest && receipt.kind === kind && receipt.added === true,
            "registry-discovery-publication-receipt",
        );
        const row = { ...resource, startedAt, finishedAt: Date.now() };
        published.push(row);
        return row;
    };
    const visible = (kind: PublicKind, latest: boolean) => {
        const rows = published.filter((row) => row.reference.kind === kind);
        if (!latest) {
            return rows;
        }
        const selected = new Map<string, PublishedResource>();
        for (const row of rows) {
            selected.set(row.reference.id, row);
        }
        return [...selected.values()];
    };
    return {
        read,
        owner,
        scope,
        publish,
        published,
        visible,
        async initialize(profile: string) {
            const deadline = Date.now() + 180_000;
            const count = profile === "large" ? 64 : profile === "history" ? 33 : 1;
            for (const kind of kinds) {
                for (let index = 0; index < count; index++) {
                    assertCondition(Date.now() < deadline, "registry-discovery-preparation-deadline");
                    await publish(kind, profile === "large" ? index : 0, profile === "history" ? index : 0);
                }
            }
        },
        async snapshot(rows: readonly PublishedResource[] = published) {
            const reservation = await read.fixture("namespace-get", { namespace });
            const states = [];
            for (const row of rows) {
                const result = await read.fixture("publication-state", coordinate(row));
                assertPublicationState(result, 0, null);
                states.push(result);
            }
            return { reservation, states };
        },
        async refuseForeignMutation(foreign: RegistryReadPorts, row: PublishedResource) {
            const before = await this.snapshot([row]);
            const denied = await foreign.call("publication-yank", "http", {
                ...coordinate(row),
                namespaceRevision,
                expectedRevision: 0,
                reason: "Refused foreign discovery mutation",
            });
            assertCondition(
                !denied.observation.validated && denied.observation.status === 409,
                "registry-discovery-foreign-mutation",
            );
            const output = requireRecord(await read.fixture("publication-state", coordinate(row)));
            assertPublicationState(output, 0, null);
            return before;
        },
        // Immutable owned releases are removed only with the exact disposable stack.
    };
}

export type RegistryDiscoveryState = ReturnType<typeof registryDiscoveryState>;
