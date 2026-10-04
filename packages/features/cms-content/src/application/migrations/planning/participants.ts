import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { createHash } from "node:crypto";
import type {
    CollectionMigrationParticipant,
    CollectionMigrationParticipantSnapshot,
    CollectionMigrationResourceReference,
} from "../interfaces";

export async function snapshotMigrationParticipants(
    siteId: string,
    participants: readonly CollectionMigrationParticipant[],
): Promise<CollectionMigrationParticipantSnapshot[]> {
    return Promise.all(
        participants.map(async (participant) => {
            const references = normalizeReferences(await participant.collectReferences(siteId));
            const identities = [
                ...new Set(references.map(({ kind, collectionId, id }) => `${kind}:${collectionId}:${id}`)),
            ].sort();
            return {
                id: participant.id,
                digest: `sha256:${createHash("sha256").update(canonicalizeIJson(identities)).digest("hex")}`,
                references,
            };
        }),
    );
}

function normalizeReferences(
    references: readonly CollectionMigrationResourceReference[],
): CollectionMigrationResourceReference[] {
    return references
        .map((reference) => structuredClone(reference))
        .sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

function referenceKey(reference: CollectionMigrationResourceReference): string {
    return `${reference.kind}:${reference.collectionId}:${reference.id}:${reference.location}`;
}
