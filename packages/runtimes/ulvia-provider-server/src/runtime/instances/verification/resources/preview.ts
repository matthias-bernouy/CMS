import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { MemoryResourceMetadataStore } from "@bernouy/resources/memory";
import { ResourceAssets, ResourceTexts, withResourceTexts } from "@bernouy/resources/storage";
import { copyResourceContent, emptyResourceProgress } from "@bernouy/resources/initialization";
import type { ResourceInitializationPreview } from "@bernouy/resources/initialization";
import { readResourceArchive } from "@bernouy/resources";
import type { ResourcePreparationTask, ResourceArchiveWire } from "./protocol";
import { resourcePreviewBindings } from "./bindings";

/** Disposable ordinary writes, without a catalogue, installed view or execution of authored JavaScript. */
export async function prepareResourceTask(
    task: ResourcePreparationTask,
): Promise<ResourceArchiveWire | ResourceInitializationPreview> {
    const archive = task.bytes ? await readResourceArchive(task.bytes, { expectedDigest: task.digest! }) : null;
    if (task.kind === "resource-archive") {
        return {
            digest: archive!.digest,
            document: archive!.document,
            assets: await Promise.all(
                archive!.assets.map(async ({ definition, bytes }) => ({
                    definition,
                    bytes: new Uint8Array(await bytes.arrayBuffer()),
                })),
            ),
        };
    }
    const raw = new InMemoryContentRepository();
    await raw.updateSystem(task.system);
    const metadata = new MemoryResourceMetadataStore("resource-preview");
    const texts = new ResourceTexts(metadata);
    const content = new ValidatingContentRepository(
        withResourceTexts(raw, texts),
        resourcePreviewBindings(task.execution),
    );
    const copied = await copyResourceContent(
        archive,
        {
            content,
            metadata,
            texts,
            assets: new ResourceAssets(metadata, new MemoryBlobStore()),
            createBloc: raw.createBloc.bind(raw),
        },
        {
            initial: emptyResourceProgress(),
            signal: new AbortController().signal,
            assertHeld: async () => {},
            checkpoint: async () => {},
        },
        null,
    );
    const requirements = [];
    for (const { path } of copied.pages) {
        const page = await content.getPage(path);
        requirements.push(...(await content.getPageRequirements(page!)));
    }
    return { requirements, pages: copied.pages, themeDigest: copied.themeDigest };
}
