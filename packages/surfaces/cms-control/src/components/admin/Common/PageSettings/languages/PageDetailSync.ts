type PathSavedEvent = CustomEvent<{ primaryPath: string; revision: number }>;
type RevisionSavedEvent = CustomEvent<{ revision: number }>;
type SourceSuccessEvent = CustomEvent<{ body?: { revision?: number } }>;

/** Keep the bound page detail in place while its independent forms save. */
export class PageDetailSync extends HTMLElement {
    connectedCallback(): void {
        this.style.display = "contents";
        this.addEventListener("click", this.openAction);
        this.addEventListener("cms-source:success", this.settingsSaved);
        this.addEventListener("page:paths-saved", this.pathsSaved);
        this.addEventListener("page:revision-saved", this.revisionSaved);
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.openAction);
        this.removeEventListener("cms-source:success", this.settingsSaved);
        this.removeEventListener("page:paths-saved", this.pathsSaved);
        this.removeEventListener("page:revision-saved", this.revisionSaved);
    }

    private readonly openAction = (event: Event): void => {
        const item = event
            .composedPath()
            .find(
                (target): target is HTMLElement =>
                    target instanceof HTMLElement && target.localName === "p9r-action-menu-item",
            );
        const targetId = item?.getAttribute("data-modal-target");
        if (targetId !== "manage-page-languages-modal" && targetId !== "delete-page-modal") {
            return;
        }
        this.querySelector<HTMLElement & { show?: () => void }>(`#${targetId}`)?.show?.();
    };

    private readonly settingsSaved = (event: Event): void => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.id !== "page-settings-form") {
            return;
        }
        const revision = (event as SourceSuccessEvent).detail?.body?.revision;
        this.updateRevision(revision);
        const title = form.querySelector<HTMLElement & { value: string }>('p9r-input[name="title"]')?.value.trim();
        const heading = this.querySelector('cms-shell-detail > [slot="title"]');
        if (title && heading) {
            heading.textContent = title;
        }
        const description = form.querySelector<HTMLElement & { value: string }>(
            'p9r-textarea[name="description"]',
        )?.value;
        if (title !== undefined && description !== undefined) {
            this.querySelector<HTMLElement & { updateDefaults: (title: string, description: string) => void }>(
                "cms-page-languages",
            )?.updateDefaults(title, description);
        }
    };

    private readonly pathsSaved = (event: Event): void => {
        const path = (event as PathSavedEvent).detail?.primaryPath;
        this.updateRevision((event as PathSavedEvent).detail?.revision);
        if (!path) {
            return;
        }
        const field = this.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]');
        if (field) {
            field.setAttribute("value", path);
            field.value = path;
        }
        const link = this.querySelector('p9r-action-menu-item[data-action="view-public"]');
        const currentUrl = link?.getAttribute("href");
        if (currentUrl) {
            link?.setAttribute("href", currentUrl.startsWith("/") ? path : new URL(path, currentUrl).href);
        }
    };

    private readonly revisionSaved = (event: Event): void => {
        this.updateRevision((event as RevisionSavedEvent).detail?.revision);
    };

    private updateRevision(revision: number | undefined): void {
        if (!Number.isSafeInteger(revision)) {
            return;
        }
        const revisionInput = this.querySelector<HTMLInputElement>('input[name="revision"]');
        if (revisionInput) {
            revisionInput.value = String(revision);
        }
        this.querySelector("cms-page-delete")?.setAttribute("page-revision", String(revision));
    }
}
