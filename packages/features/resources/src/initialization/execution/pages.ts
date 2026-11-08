import { createCmsPage, publishCmsPage, readSystemSnapshot } from "@bernouy/content";
import { resourceDigest } from "resources/storage/records";
import type { ResourcePage } from "resources/artifacts/archive/schemas";
import type { ResourceCopyPorts, ResourceCopyProgress } from "../interfaces";
import type { ResourceInitializationProgress, ResourcePreviewPage } from "../schemas";
import { resourceInitializationError } from "../state";

export async function copyResourcePages(
    seeds: readonly ResourcePage[],
    ports: ResourceCopyPorts,
    progress: ResourceInitializationProgress,
    guard: ResourceCopyProgress,
    expected: readonly ResourcePreviewPage[] | null,
): Promise<ResourcePreviewPage[]> {
    const repository = ports.content;
    for (const seed of seeds) {
        await guard.assertHeld();
        const id = progress.pageIds[seed.path];
        let page = id ? await repository.getPageById(id) : await repository.getPage(seed.path);
        if (id && !page) {
            throw resourceInitializationError("An initialized Page disappeared", 409);
        }
        if (!id && page && (page.content !== "" || page.title !== seed.title || page.visible)) {
            throw resourceInitializationError("An existing Page owns an initialization route", 409);
        }
        if (!page) {
            const created = await createCmsPage(repository, { path: seed.path, title: seed.title });
            page = await repository.getPageById(created.id);
        }
        if (!page || page.path !== seed.path) {
            throw resourceInitializationError("Initialization Page identity changed", 409);
        }
        if (!id) {
            progress.pageIds[seed.path] = page.id;
            await guard.assertHeld();
            await guard.checkpoint(progress);
        }
    }
    const result: ResourcePreviewPage[] = [];
    for (const seed of seeds) {
        await guard.assertHeld();
        const required = expected?.find((page) => page.path === seed.path)?.contentDigest;
        if (expected && !required) {
            throw resourceInitializationError("Page was not covered by the reviewed preview", 409);
        }
        let current = await repository.getPageById(progress.pageIds[seed.path]!);
        if (
            !current ||
            current.title !== seed.title ||
            (current.content !== "" && required && resourceDigest(current.content) !== required)
        ) {
            throw resourceInitializationError("An initialized Page was changed", 409);
        }
        if (progress.pages.includes(seed.path)) {
            if (seed.systemRole === "login" && (await repository.getSystem()).site.login?.pageId !== current.id) {
                throw resourceInitializationError("Completed login Page role was changed", 409);
            }
            if (
                !required ||
                resourceDigest(current.content) !== required ||
                current.visible !== seed.visible ||
                current.description !== seed.description ||
                current.indexing?.enabled !== seed.indexing
            ) {
                throw resourceInitializationError("Completed Page does not match its review", 409);
            }
        } else {
            const page = await repository.updatePage(
                {
                    id: current.id,
                    content: seed.html,
                    description: seed.description,
                    indexing: { enabled: seed.indexing },
                },
                current.revision,
            );
            if (!page) {
                throw resourceInitializationError("Initialization Page disappeared", 409);
            }
            if (required && resourceDigest(page.content) !== required) {
                throw resourceInitializationError("Page implementation disagrees with the reviewed preview", 409);
            }
            current = page;
            await guard.assertHeld();
            if (page.visible !== seed.visible) {
                await publishCmsPage(repository, {
                    id: page.id,
                    expectedRevision: page.revision,
                    visible: seed.visible,
                });
            }
            if (seed.systemRole === "login") {
                const system = await readSystemSnapshot(repository);
                if (system.system.site.login !== null && system.system.site.login.pageId !== page.id) {
                    throw resourceInitializationError("Another Page owns the login role", 409);
                }
                if (system.system.site.login === null) {
                    await guard.assertHeld();
                    await repository.updateSystem(
                        { site: { ...system.system.site, login: { pageId: page.id } } },
                        system.revision,
                    );
                }
            }
            progress.pages.push(seed.path);
            await guard.assertHeld();
            await guard.checkpoint(progress);
        }
        result.push({ path: seed.path, contentDigest: resourceDigest(current.content) });
    }
    return result;
}
