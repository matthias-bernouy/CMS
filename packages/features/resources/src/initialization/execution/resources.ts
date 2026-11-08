import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { createTextRecord } from "resources/storage/records";
import type { VerifiedResourceArchive } from "resources/interfaces/archive";
import type { ResourceCopyPorts, ResourceCopyProgress } from "../interfaces";
import type { ResourceInitializationProgress } from "../schemas";
import { resourceInitializationError } from "../state";

/** Exact retries recognize uncertain commits, never replace an existing resource. */
export async function copyResourceEntities(
    archive: VerifiedResourceArchive,
    ports: ResourceCopyPorts,
    progress: ResourceInitializationProgress,
    guard: ResourceCopyProgress,
): Promise<void> {
    for (const entry of archive.assets) {
        await guard.assertHeld();
        const { entry: _entry, ...asset } = entry.definition;
        const key = `${asset.namespace}:${asset.id}`;
        if (
            progress.assets.includes(key) &&
            !(await ports.assets.getMetadata([{ namespace: asset.namespace, id: asset.id }])).length
        ) {
            throw resourceInitializationError("A completed resource asset disappeared", 409);
        }
        await ports.assets.putExact(asset, new Uint8Array(await entry.bytes.arrayBuffer()), guard.signal);
        if (!progress.assets.includes(key)) {
            progress.assets.push(key);
            await guard.assertHeld();
            await guard.checkpoint(progress);
        }
    }
    for (const source of archive.document.texts) {
        await guard.assertHeld();
        const current = await ports.metadata.getTexts(source.namespace);
        if (progress.texts.includes(source.namespace) && !current) {
            throw resourceInitializationError("A completed resource text source disappeared", 409);
        }
        if (current && current.revision !== createTextRecord(source).revision) {
            throw resourceInitializationError("Initialized resource texts were changed", 409);
        }
        await ports.texts.createExact(source);
        if (!progress.texts.includes(source.namespace)) {
            progress.texts.push(source.namespace);
            await guard.assertHeld();
            await guard.checkpoint(progress);
        }
    }
    for (const bloc of archive.document.blocs) {
        await guard.assertHeld();
        const current = await ports.content.getBlocRecord(bloc.id);
        if (progress.blocs.includes(bloc.id) && !current) {
            throw resourceInitializationError("A completed resource Bloc disappeared", 409);
        }
        if (current && canonicalizeIJson(current.artifact) !== canonicalizeIJson(bloc)) {
            throw resourceInitializationError("An existing Bloc conflicts with initialization", 409);
        }
        if (!current) {
            await ports.createBloc(bloc);
        }
        if (!progress.blocs.includes(bloc.id)) {
            progress.blocs.push(bloc.id);
            await guard.assertHeld();
            await guard.checkpoint(progress);
        }
    }
}
