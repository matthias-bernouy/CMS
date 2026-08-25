import { derivePagePath, isValidPathFormat } from "@bernouy/cms-content/page-path";
import type {
    CMS_SOURCE_FAILED_EVENT as CmsSourceFailedEvent,
    CMS_SOURCE_SUCCESS_EVENT as CmsSourceSuccessEvent,
    CmsSourceResultEvent,
} from "@bernouy/components/binding";
import { resolvePageForm, resolvePageInput, type PageInputControl } from "./pageFormFields";
import { PagePathAvailability } from "./pagePathAvailability";

const PATH_FORMAT_ERROR = 'Start with "/". Use only letters, numbers, hyphens and single slashes.';
const PATH_TAKEN_ERROR = "A page already uses this path.";
const SOURCE_FAILED_EVENT: typeof CmsSourceFailedEvent = "cms-source:failed";
const SOURCE_SUCCESS_EVENT: typeof CmsSourceSuccessEvent = "cms-source:success";

export class PageFormController extends HTMLElement {
    static readonly observedAttributes = ["form", "mode", "availability-url", "current-path"];

    private form: HTMLFormElement | null = null;
    private titleControl: PageInputControl | null = null;
    private path: PageInputControl | null = null;
    private availability: PagePathAvailability | null = null;
    private availabilityTimer: ReturnType<typeof setTimeout> | null = null;
    private pathEditedByUser = true;
    private pathErrorKind: "format" | "availability" | "server" | null = null;

    connectedCallback(): void {
        queueMicrotask(() => this.bind());
    }

    disconnectedCallback(): void {
        this.unbind();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            queueMicrotask(() => this.bind());
        }
    }

    private bind(): void {
        this.unbind();
        const form = resolvePageForm(this);
        const title = form ? resolvePageInput(form, "title") : null;
        const path = form ? resolvePageInput(form, "path") : null;
        if (!form || !title || !path) {
            return;
        }
        this.form = form;
        this.titleControl = title;
        this.path = path;
        this.pathEditedByUser = this.getAttribute("mode") !== "create" || path.value !== "";
        this.availability = new PagePathAvailability(
            this.ownerDocument,
            () => this.getAttribute("availability-url")?.trim() ?? "",
            () => this.getAttribute("current-path")?.trim() ?? "",
        );
        title.addEventListener("input", this.onTitleInput);
        path.addEventListener("input", this.onPathInput);
        path.addEventListener("change", this.onPathChange);
        form.addEventListener("reset", this.onReset);
        form.addEventListener(SOURCE_SUCCESS_EVENT, this.onReset);
        form.addEventListener(SOURCE_FAILED_EVENT, this.onFailure);
        this.validateEditedPath();
    }

    private unbind(): void {
        this.titleControl?.removeEventListener("input", this.onTitleInput);
        this.path?.removeEventListener("input", this.onPathInput);
        this.path?.removeEventListener("change", this.onPathChange);
        this.form?.removeEventListener("reset", this.onReset);
        this.form?.removeEventListener(SOURCE_SUCCESS_EVENT, this.onReset);
        this.form?.removeEventListener(SOURCE_FAILED_EVENT, this.onFailure);
        this.cancelAvailability();
        this.form = null;
        this.titleControl = null;
        this.path = null;
        this.availability = null;
    }

    private readonly onTitleInput = (): void => {
        this.titleControl?.setCustomValidity("");
        if (!this.path || this.pathEditedByUser) {
            return;
        }
        this.path.value = derivePagePath(this.titleControl?.value ?? "");
        if (this.validateEditedPath()) {
            this.scheduleAvailability();
        }
    };

    private readonly onPathInput = (): void => {
        this.pathEditedByUser = true;
        if (this.validateEditedPath()) {
            this.scheduleAvailability();
        }
    };

    private readonly onPathChange = (): void => {
        if (this.path && isValidPathFormat(this.path.value)) {
            void this.checkAvailability();
        }
    };

    private readonly onFailure = (event: CmsSourceResultEvent): void => {
        const body = event.detail.body as { error?: unknown; field?: unknown } | null;
        if (!body || typeof body.error !== "string") {
            return;
        }
        const control = body.field === "path" ? this.path : body.field === "title" ? this.titleControl : null;
        if (!control) {
            return;
        }
        if (control === this.path) {
            this.pathErrorKind = "server";
        }
        control.setCustomValidity(body.error);
        control.reportValidity();
        control.focus();
    };

    private readonly onReset = (): void => {
        queueMicrotask(() => {
            this.titleControl?.setCustomValidity("");
            this.setPathError("", null);
            this.pathEditedByUser = this.getAttribute("mode") !== "create";
        });
    };

    private validateEditedPath(): boolean {
        this.cancelAvailability();
        const value = this.path?.value ?? "";
        if (!value) {
            this.setPathError("", null);
            return false;
        }
        if (!isValidPathFormat(value)) {
            this.setPathError(PATH_FORMAT_ERROR, "format");
            return false;
        }
        this.setPathError("", null);
        return true;
    }

    private scheduleAvailability(): void {
        this.availabilityTimer = setTimeout(() => void this.checkAvailability(), 350);
    }

    private async checkAvailability(): Promise<void> {
        if (this.availabilityTimer !== null) {
            clearTimeout(this.availabilityTimer);
            this.availabilityTimer = null;
        }
        const candidate = this.path?.value ?? "";
        if (!candidate || !isValidPathFormat(candidate) || !this.availability) {
            return;
        }
        const result = await this.availability.check(candidate);
        if (!this.path || this.path.value !== candidate) {
            return;
        }
        if (result === "taken") {
            this.setPathError(PATH_TAKEN_ERROR, "availability");
        } else if (result === "available" && this.pathErrorKind === "availability") {
            this.setPathError("", null);
        }
    }

    private cancelAvailability(): void {
        if (this.availabilityTimer !== null) {
            clearTimeout(this.availabilityTimer);
            this.availabilityTimer = null;
        }
        this.availability?.cancel();
    }

    private setPathError(message: string, kind: "format" | "availability" | "server" | null): void {
        this.pathErrorKind = kind;
        this.path?.setCustomValidity(message);
    }
}
