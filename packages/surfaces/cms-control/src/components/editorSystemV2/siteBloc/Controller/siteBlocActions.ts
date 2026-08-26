import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { publishSiteBloc, saveSiteBloc, setSiteBlocArchived, type SiteBlocMetadata } from "../siteBlocApi";
import type { SiteBlocFrames } from "./siteBlocFrames";
import type { SiteBlocView } from "../siteBlocView";

export type SiteBlocBuilderAction = { kind: "save" } | { kind: "publish" } | { kind: "archive" };

export type SiteBlocActionContext = {
    view: SiteBlocView;
    frames: SiteBlocFrames;
    definition(): SiteBlocDefinition | null;
    setDefinition(definition: SiteBlocDefinition): void;
    dirty(): boolean;
    busy(): boolean;
    setBusy(busy: boolean): void;
    configure(): void;
    renderControls(): void;
    fail(error: unknown): void;
};

export class SiteBlocActions {
    private pending: SiteBlocBuilderAction | null = null;

    constructor(private readonly context: SiteBlocActionContext) {}

    queue(action: SiteBlocBuilderAction): void {
        const definition = this.context.definition();
        if (this.context.busy() || !definition) {
            return;
        }
        const archived = definition.lifecycle === "archived";
        if (archived && action.kind !== "archive") {
            return;
        }
        if (!this.context.frames.ready && !(archived && action.kind === "archive")) {
            return;
        }
        const mustSave = action.kind === "save" || action.kind === "publish" || this.context.dirty();
        this.begin();
        if (!mustSave) {
            void this.afterSave(action);
            return;
        }
        this.pending = action;
        this.context.view.setStatus("Saving draft…");
        this.context.view.shell.requestSave();
    }

    onSaveDocument(content: string, metadata: SiteBlocMetadata): void {
        const action = this.pending ?? { kind: "save" as const };
        this.pending = null;
        if (!this.context.busy()) {
            this.begin();
        }
        void this.persist(content, metadata, action);
    }

    private begin(): void {
        this.context.setBusy(true);
        this.context.view.showError(null);
        this.context.renderControls();
    }

    private async persist(content: string, metadata: SiteBlocMetadata, action: SiteBlocBuilderAction): Promise<void> {
        const definition = this.context.definition();
        if (!definition) {
            return;
        }
        try {
            const saved = await saveSiteBloc(definition, metadata, content);
            this.context.frames.dirty = false;
            this.context.setDefinition(saved);
            await this.afterSave(action);
        } catch (error) {
            this.pending = null;
            this.context.fail(error);
        }
    }

    private async afterSave(action: SiteBlocBuilderAction): Promise<void> {
        try {
            if (action.kind === "publish") {
                const published = await publishSiteBloc(this.context.definition()!);
                this.context.setDefinition(published);
                this.context.configure();
                this.context.view.setStatus(`Published revision ${published.publishedRevision}.`);
            } else if (action.kind === "archive") {
                const archived = this.context.definition()!.lifecycle !== "archived";
                const updated = await setSiteBlocArchived(this.context.definition()!, archived);
                this.context.setDefinition(updated);
                this.context.configure();
            } else {
                const revision = this.context.definition()!.draftRevision;
                this.context.configure();
                this.context.view.setStatus(`Draft revision ${revision} saved.`);
            }
            this.context.setBusy(false);
            this.context.renderControls();
        } catch (error) {
            this.context.fail(error);
        }
    }
}
