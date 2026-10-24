import { callCapability } from "../client";
import type { PageUpdate } from "../model";

export type SessionMessages = Readonly<{
    changed: string;
    missingRevision: string;
}>;

export class PageEditorSession {
    private pageId: string | null = null;
    private revision = 0;
    private loadedContent = "";

    initialize(id: string, revision: number, content: string): boolean {
        if (id === this.pageId && revision <= this.revision) {
            return false;
        }
        this.pageId = id;
        this.revision = revision;
        this.loadedContent = content;
        return true;
    }

    isDirty(content: string): boolean {
        return content !== this.loadedContent;
    }

    async save(content: string, messages: SessionMessages): Promise<PageUpdate> {
        const id = this.pageId;
        if (!id || !Number.isSafeInteger(this.revision)) {
            throw new Error(messages.missingRevision);
        }
        const latest = await callCapability<PageUpdate>("get", { id });
        if (latest.content !== this.loadedContent) {
            throw new Error(messages.changed);
        }
        const updated = await callCapability<PageUpdate>("update", {
            id,
            expectedRevision: latest.revision,
            content,
        });
        this.revision = updated.revision;
        this.loadedContent = updated.content;
        return updated;
    }
}
