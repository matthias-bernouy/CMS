import { rerunIntegrationInstallation, route } from "../../Integrations/api";
import { createCollection, createComposition } from "../data/api";
import { navigate } from "../data/route";
import type { BlocWorkspace } from "../Workspace";
import { showForm } from "./dialog";
import { showImport, showUpdates } from "./managed";

export class LibraryOperations {
    constructor(private workspace: BlocWorkspace) {}

    async perform(action: string, target: HTMLElement): Promise<void> {
        const workspace = this.workspace;
        const collection = workspace.collection;
        if (workspace.busy) {
            return;
        }
        switch (action) {
            case "retry":
                await workspace.load(true);
                break;
            case "create-collection":
                showForm(workspace.root, {
                    title: "Create a collection",
                    description: "Give your reusable compositions a home.",
                    submitLabel: "Create collection",
                    submit: async (name, description) => {
                        const created = await createCollection(name, description);
                        await workspace.load(true);
                        navigate({ collection: `site:${created.id}` });
                    },
                });
                break;
            case "create-composition":
                if (!collection?.siteId) {
                    return;
                }
                showForm(workspace.root, {
                    title: "New composition",
                    description: `Create a reusable composition in ${collection.name}.`,
                    submitLabel: "Create and open editor",
                    submit: async (name, description) => {
                        const created = await createComposition(collection.siteId!, name, description);
                        location.assign(route(`/editor/bloc?tag=${encodeURIComponent(created.tag)}`));
                    },
                });
                break;
            case "open-bloc":
                navigate({ collection: collection?.key, bloc: target.dataset.tag, query: workspace.filters.query });
                break;
            case "load-more":
                workspace.filters.limit += 24;
                workspace.render();
                break;
            case "check-updates":
                if (collection?.installation) {
                    await showUpdates(workspace.root, collection, async () => {
                        workspace.drafts.clear(collection.installation!.id);
                        await workspace.load(true);
                        workspace.notice("Collection updated.");
                    });
                }
                break;
            case "install-collection":
                await showImport(workspace.root, target.dataset.kind!, async (id) => {
                    await workspace.load(true);
                    navigate({ collection: `managed:${id}` });
                    workspace.notice("Collection added. Choose which blocs appear in the editor.");
                });
                break;
            case "discard-availability":
                if (workspace.detail) {
                    workspace.drafts.clear(workspace.detail.id);
                    workspace.render();
                }
                break;
            case "save-availability":
                await this.saveAvailability();
                break;
        }
    }

    private async saveAvailability(): Promise<void> {
        const workspace = this.workspace;
        const id = workspace.detail?.id;
        const availability = workspace.availability;
        if (!id || !availability?.dirty) {
            return;
        }
        workspace.busy = true;
        workspace.renderAvailability();
        try {
            await rerunIntegrationInstallation(id, undefined, [...availability.selected].sort());
            workspace.drafts.clear(id);
            await workspace.load(true);
            workspace.notice("Editor availability saved.");
        } catch (error) {
            workspace.notice(error instanceof Error ? error.message : "Unable to save. Please try again.", true);
        } finally {
            workspace.busy = false;
            workspace.renderAvailability();
        }
    }
}
