import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

type Product = {
    id: number;
    slug: string;
    title: string;
    metadata?: SourceRecord;
    variantAxes?: VariantAxis[];
    variants?: Variant[];
};
type VariantAxis = { key: string; label?: string; position?: number };
type VariantChoice = {
    axisKey: string;
    axisLabel?: string;
    valueKey: string;
    valueLabel?: string;
};
type Variant = {
    id: number;
    title: string;
    status: string;
    choices?: VariantChoice[];
};
type VariantOption = { key: string; label: string };
type OfferCondition = { code: string; label: string; description?: string | null; enabled?: boolean };
type SourceRecord = Record<string, any>;
type FormFieldElement = HTMLElement & { value: string };
class RemoteRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
const draftStorageKey = "mossa:sell-draft";

export class Bloc extends Component {
    static observedAttributes = [
        "currency",
        "maximum-photos",
        "minimum-photos",
        "valuation-maximum-field",
        "valuation-minimum-field",
    ];
    private product: Product | null = null;
    private variants: Variant[] = [];
    private variantAxes: VariantAxis[] = [];
    private variantSelections = new Map<string, string>();
    private selectedVariant: Variant | null = null;
    private variantId: number | null = null;
    private variantRequired = false;
    private files: File[] = [];
    private authenticated = false;
    private authSubject: SourceRecord | null = null;
    private searchTimer?: number;
    private previewUrls: string[] = [];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.applyCopy();
        this.copySlots.forEach((slot) => slot.addEventListener("slotchange", this.applyCopy));
        this.syncPhotoPolicy();
        this.form.addEventListener("submit", this.onSubmit);
        this.search.addEventListener("input", this.onSearch);
        this.search.addEventListener("focus", this.onSearch);
        this.photosUpload.addEventListener("change", this.onPhotos);
        this.nextButtons.forEach((button) => button.addEventListener("click", this.onNext));
        this.editButtons.forEach((button) => button.addEventListener("click", this.onEdit));
        this.authLink.addEventListener("click", this.saveDraft);
        this.start().catch((error) => this.fail(error));
    }

    disconnectedCallback(): void {
        this.copySlots.forEach((slot) => slot.removeEventListener("slotchange", this.applyCopy));
        this.form.removeEventListener("submit", this.onSubmit);
        this.search.removeEventListener("input", this.onSearch);
        this.search.removeEventListener("focus", this.onSearch);
        this.photosUpload.removeEventListener("change", this.onPhotos);
        this.nextButtons.forEach((button) => button.removeEventListener("click", this.onNext));
        this.editButtons.forEach((button) => button.removeEventListener("click", this.onEdit));
        this.authLink.removeEventListener("click", this.saveDraft);
        this.clearPhotoPreviews();
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        this.syncPhotoPolicy();
        this.applyCopy();
        this.renderPhotoPreviews();
    }

    private async start() {
        await Promise.all([
            this.checkAuth().catch((error) => {
                if (!(error instanceof RemoteRequestError) || (error.status !== 401 && error.status !== 403)) {
                    throw error;
                }
                this.applyAuth(false);
            }),
            this.loadConditions(),
        ]);
        if (this.authenticated && new URL(location.href).searchParams.get("resume") === "sell") {
            await this.restoreDraft();
        }
    }

    private async loadConditions() {
        const data = await this.request("/.cms/sources/commerce/offerConditions");
        const conditions = (Array.isArray(data.items) ? data.items : []).filter(
            (item): item is OfferCondition =>
                item &&
                typeof item === "object" &&
                typeof item.code === "string" &&
                typeof item.label === "string" &&
                item.enabled !== false,
        );
        this.conditionOptions.replaceChildren(
            ...conditions.map((condition, index) => {
                const label = document.createElement("label");
                const input = document.createElement("input");
                input.type = "radio";
                input.name = "condition";
                input.value = condition.code;
                input.required = index === 0;
                input.dataset.label = condition.label;
                const copy = document.createElement("span");
                const title = document.createElement("strong");
                title.textContent = condition.label;
                copy.append(title);
                const description = String(condition.description || "").trim();
                if (description) {
                    const detail = document.createElement("small");
                    detail.textContent = description;
                    copy.append(detail);
                }
                label.append(input, copy);
                return label;
            }),
        );
    }

    private onSearch = () => {
        window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(
            () => this.loadProducts().catch((error) => this.fail(error, this.copy("searchFailed"))),
            220,
        );
    };

    private async loadProducts() {
        const query = this.search.value.trim();
        const data = await this.request(
            `/.cms/sources/commerce/products?limit=20${query ? `&q=${encodeURIComponent(query)}` : ""}`,
        );
        const products = Array.isArray(data.items) ? (data.items as Product[]) : [];
        this.results.replaceChildren(
            ...products.map((product) => {
                const button = document.createElement("button");
                button.type = "button";
                button.setAttribute("role", "option");
                button.textContent = product.title;
                button.addEventListener("click", () => {
                    void this.selectProduct(product.id).catch((error) => this.fail(error, this.copy("modelFailed")));
                });
                return button;
            }),
        );
        this.results.hidden = products.length === 0;
    }

    private async selectProduct(id: number) {
        this.product = (await this.request(`/.cms/sources/commerce/product?id=${id}`)) as Product;
        this.search.value = this.product.title;
        this.results.hidden = true;
        this.selected.textContent = this.product.title;
        this.selected.hidden = false;
        const variants = (this.product.variants || []).filter((item) => item.status === "active");
        this.variants = variants;
        this.variantAxes = resolveVariantAxes(this.product.variantAxes, variants);
        this.variantSelections.clear();
        this.selectedVariant = null;
        this.variantId = null;
        this.variantRequired = variants.length > 0;
        this.renderVariantFields();
        this.variantWrap.hidden = variants.length === 0;
        this.refreshEstimate();
    }

    private renderVariantFields() {
        if (this.variants.length === 0) {
            this.variantFields.replaceChildren();
            return;
        }
        if (this.variantAxes.length === 0) {
            this.variantFields.replaceChildren(
                this.createVariantField(
                    this.copy("exactVersion"),
                    this.copy("chooseVariant"),
                    this.variants.map((variant) => ({ key: String(variant.id), label: variant.title })),
                    this.selectedVariant ? String(this.selectedVariant.id) : null,
                    false,
                    (key) => {
                        const variant = this.variants.find((item) => String(item.id) === key);
                        if (variant) {
                            this.selectVariant(variant);
                        }
                    },
                ),
            );
            return;
        }

        this.variantFields.replaceChildren(
            ...this.variantAxes.map((axis, index) => {
                const previousAxes = this.variantAxes.slice(0, index);
                const enabled = previousAxes.every((item) => this.variantSelections.has(item.key));
                const compatibleVariants = this.variants.filter((variant) =>
                    previousAxes.every((item) => {
                        const selected = this.variantSelections.get(item.key);
                        return !selected || variantChoice(variant, item.key)?.valueKey === selected;
                    }),
                );
                const choices = uniqueVariantChoices(compatibleVariants, axis.key);
                return this.createVariantField(
                    axis.label || axis.key,
                    this.copy("choose"),
                    choices.map((choice) => ({
                        key: choice.valueKey,
                        label: choice.valueLabel || choice.valueKey,
                    })),
                    this.variantSelections.get(axis.key) ?? null,
                    !enabled,
                    (valueKey) => this.selectAxisChoice(index, axis.key, valueKey),
                );
            }),
        );
    }

    private createVariantField(
        label: string,
        placeholder: string,
        options: VariantOption[],
        selectedKey: string | null,
        disabled: boolean,
        onSelect: (key: string) => void,
    ): HTMLElement {
        const field = document.createElement("div");
        field.className = "variant-field";

        const fieldLabel = document.createElement("span");
        fieldLabel.className = "field-label";
        fieldLabel.textContent = label;

        const combobox = document.createElement("div");
        combobox.className = "variant-combobox";

        const trigger = document.createElement("button");
        trigger.className = "variant-trigger";
        trigger.type = "button";
        trigger.disabled = disabled;
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-label", label);
        trigger.textContent = options.find((option) => option.key === selectedKey)?.label ?? placeholder;

        const optionList = document.createElement("div");
        optionList.className = "variant-options";
        optionList.hidden = true;
        optionList.setAttribute("role", "listbox");
        optionList.setAttribute("aria-label", label);
        optionList.replaceChildren(
            ...options.map((option) => {
                const button = document.createElement("button");
                button.type = "button";
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", String(option.key === selectedKey));
                button.textContent = option.label;
                button.addEventListener("click", () => onSelect(option.key));
                return button;
            }),
        );

        trigger.addEventListener("click", () => {
            const open = optionList.hidden;
            this.variantFields.querySelectorAll<HTMLElement>(".variant-options").forEach((list) => {
                list.hidden = true;
            });
            this.variantFields.querySelectorAll<HTMLButtonElement>(".variant-trigger").forEach((button) => {
                button.setAttribute("aria-expanded", "false");
            });
            optionList.hidden = !open;
            trigger.setAttribute("aria-expanded", String(open));
        });

        combobox.append(trigger, optionList);
        field.append(fieldLabel, combobox);
        return field;
    }

    private selectAxisChoice(index: number, axisKey: string, valueKey: string) {
        this.variantSelections.set(axisKey, valueKey);
        this.variantAxes.slice(index + 1).forEach((axis) => this.variantSelections.delete(axis.key));
        const complete = this.variantAxes.every((axis) => this.variantSelections.has(axis.key));
        this.selectedVariant = complete
            ? (this.variants.find((variant) =>
                  this.variantAxes.every(
                      (axis) => variantChoice(variant, axis.key)?.valueKey === this.variantSelections.get(axis.key),
                  ),
              ) ?? null)
            : null;
        this.variantId = this.selectedVariant?.id ?? null;
        this.renderVariantFields();
        this.refreshEstimate();
    }

    private selectVariant(variant: Variant) {
        this.selectedVariant = variant;
        this.variantId = variant.id;
        this.variantSelections.clear();
        for (const choice of variant.choices || []) {
            this.variantSelections.set(choice.axisKey, choice.valueKey);
        }
        this.renderVariantFields();
        this.refreshEstimate();
    }

    private refreshEstimate = () => {
        if (!this.product) {
            return;
        }
        const valuation = productValuation(this.product.metadata, this.minimumField, this.maximumField);
        if (!valuation) {
            this.estimateValue.textContent = this.copy("rangePending");
            this.estimateDetail.textContent = this.copy("rangePendingDetail");
            return;
        }
        this.estimateValue.textContent = this.copy("rangeBetween", {
            minimum: money(valuation.minimum, this.currency, formattingLocale()),
            maximum: money(valuation.maximum, this.currency, formattingLocale()),
        });
        this.estimateDetail.textContent = this.copy("rangeDetail");
    };

    private onPhotos = () => {
        const selected = Array.from(this.photosUpload.files || []);
        const known = new Set(this.files.map(fileKey));
        for (const file of selected) {
            if (this.files.length >= this.maximumPhotos) {
                break;
            }
            if (!known.has(fileKey(file))) {
                this.files.push(file);
                known.add(fileKey(file));
            }
        }
        this.photosUpload.value = "";
        this.renderPhotoPreviews();
        if (selected.length && this.files.length >= this.maximumPhotos) {
            this.setStatus(this.copy("maximumPhotos", { maximum: String(this.maximumPhotos) }));
        }
    };

    private removePhoto(index: number) {
        this.files.splice(index, 1);
        this.renderPhotoPreviews();
    }

    private renderPhotoPreviews() {
        this.clearPhotoPreviews();
        this.photoPreviews.replaceChildren(
            ...this.files.map((file, index) => {
                const figure = document.createElement("figure");
                figure.className = "photo-preview";

                const image = document.createElement("img");
                const url = URL.createObjectURL(file);
                this.previewUrls.push(url);
                image.src = url;
                image.alt = this.copy("previewAlt", { position: String(index + 1), name: file.name });

                const remove = document.createElement("button");
                remove.className = "remove-photo";
                remove.type = "button";
                remove.setAttribute("aria-label", this.copy("removePhoto", { name: file.name }));
                remove.textContent = "×";
                remove.addEventListener("click", () => this.removePhoto(index));

                figure.append(image, remove);
                if (index === 0) {
                    const main = document.createElement("span");
                    main.className = "main-photo";
                    main.textContent = this.copy("mainPhoto");
                    figure.append(main);
                }
                return figure;
            }),
        );
        this.photoPreviews.hidden = this.files.length === 0;
        this.photoCount.textContent = this.files.length
            ? this.copy(this.files.length === 1 ? "photoCountOne" : "photoCountMany", {
                  count: String(this.files.length),
                  maximum: String(this.maximumPhotos),
              })
            : this.copy("noPhoto");
        this.photoPickerLabel.textContent = this.files.length ? this.copy("addMorePhotos") : this.copy("addPhotos");
        this.photoPicker.toggleAttribute("hidden", this.files.length >= this.maximumPhotos);
    }

    private syncPhotoPolicy() {
        const requirement = this.copy(
            this.minimumPhotos === this.maximumPhotos ? "photoRequirementExact" : "photoRequirementRange",
            { minimum: String(this.minimumPhotos), maximum: String(this.maximumPhotos) },
        );
        this.photoHint.textContent = `${requirement} JPEG, PNG, WebP, or AVIF, up to 5 MB per image.`;
    }

    private clearPhotoPreviews() {
        for (const url of this.previewUrls) {
            URL.revokeObjectURL(url);
        }
        this.previewUrls = [];
    }

    private onSubmit = async (event: SubmitEvent) => {
        event.preventDefault();
        const validation = this.validate();
        if (validation) {
            return this.setStatus(validation, "error");
        }
        if (!this.authenticated) {
            this.setStatus(this.copy("sessionExpired"), "error");
            this.goToStep(3);
            return;
        }
        await this.publish().catch((error) => this.fail(error, this.copy("submissionFailed")));
    };

    private onNext = (event: Event) => {
        const next = Number((event.currentTarget as HTMLElement).dataset.next);
        const message = this.validateStep(next - 1);
        if (message) {
            return this.setStatus(message, "error");
        }
        this.updateSummary(next - 1);
        this.setStatus("");
        this.goToStep(next);
    };

    private onEdit = (event: Event) => {
        const step = Number((event.currentTarget as HTMLElement).dataset.edit);
        this.goToStep(step);
    };

    private goToStep(active: number) {
        this.steps.forEach((step) => {
            const number = Number(step.dataset.step);
            step.dataset.state = number < active ? "complete" : number === active ? "active" : "pending";
        });
        this.steps
            .find((step) => Number(step.dataset.step) === active)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    private updateSummary(step: number) {
        const summary = this.shadowRoot!.querySelector<HTMLElement>(`[data-summary="${step}"]`);
        if (!summary) {
            return;
        }
        if (step === 1) {
            summary.textContent = [this.product?.title, this.selectedVariant?.title].filter(Boolean).join(" · ");
        }
        if (step === 2) {
            summary.textContent = this.conditionLabel;
        }
        if (step === 3) {
            summary.textContent = this.copy("summaryPhotos", {
                count: String(this.files.length),
                description: this.description.value.trim() ? ` · ${this.copy("descriptionAdded")}` : "",
            });
        }
    }

    private saveDraft = () => {
        if (!this.product) {
            return;
        }
        sessionStorage.setItem(
            draftStorageKey,
            JSON.stringify({
                productId: this.product.id,
                variantId: this.variantId,
                condition: this.condition,
            }),
        );
    };

    private async restoreDraft() {
        const raw = sessionStorage.getItem(draftStorageKey);
        if (!raw) {
            return;
        }
        const draft = JSON.parse(raw) as { productId?: number; variantId?: number | null; condition?: string };
        if (!draft.productId) {
            return;
        }
        await this.selectProduct(draft.productId);
        if (draft.variantId) {
            const variant = this.variants.find((item) => item.id === draft.variantId);
            if (variant) {
                this.selectVariant(variant);
            }
        }
        const grade = this.grades.find((input) => input.value === draft.condition);
        if (grade) {
            grade.checked = true;
        }
        this.refreshEstimate();
        this.updateSummary(1);
        this.updateSummary(2);
        this.goToStep(3);
        sessionStorage.removeItem(draftStorageKey);
        const url = new URL(location.href);
        url.searchParams.delete("resume");
        history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    private async checkAuth() {
        this.authSubject = await this.request("/.cms/sources/user-account/getAccount");
        this.applyAuth(true);
    }

    private applyAuth(authenticated: boolean) {
        this.authenticated = authenticated;
        this.authGate.hidden = authenticated;
        this.sellerDetails.hidden = !authenticated;
    }

    private async publish() {
        this.setBusy(true, this.copy("preparing"));
        try {
            let seller = await this.request("/.cms/sources/commerce/mySeller");
            if (!seller.exists) {
                const account = this.authSubject || {};
                const fullName = [account.givenName, account.surname]
                    .filter((value) => typeof value === "string" && value.trim())
                    .join(" ");
                seller = await this.request("/.cms/sources/commerce/registerMySeller", {
                    method: "POST",
                    body: JSON.stringify({ displayName: fullName || this.authSubject?.email || this.copy("seller") }),
                });
            }
            const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
            const offer = await this.request("/.cms/sources/commerce/createMyOffer", {
                method: "POST",
                body: JSON.stringify({
                    productId: this.product!.id,
                    ...(this.variantId ? { variantId: this.variantId } : {}),
                    slug: `${slugify(this.product!.slug || this.product!.title)}-${suffix}`,
                    title: this.product!.title,
                    description: this.description.value.trim() || null,
                    conditionCode: this.condition,
                    availability: "available",
                    quantityAvailable: 1,
                }),
            });
            for (let index = 0; index < this.files.length; index++) {
                this.setStatus(
                    this.copy("uploading", { position: String(index + 1), count: String(this.files.length) }),
                );
                const body = new FormData();
                body.set("file", this.files[index]);
                await this.request(`/.cms/sources/commerce/uploadMyOfferImage?offerId=${offer.id}`, {
                    method: "POST",
                    body,
                });
            }
            this.setStatus(this.copy("submitting"));
            await this.request(`/.cms/sources/commerce/submitMyOffer?id=${offer.id}`, {
                method: "POST",
                body: JSON.stringify({ expectedVersion: offer.version }),
            });
            this.setStatus(this.copy("submitted"), "success");
            const successUrl = this.successNavigation.getAttribute("href")?.trim() || "";
            if (successUrl && successUrl !== "#") {
                this.successNavigation.href = successUrl.replaceAll("{id}", encodeURIComponent(offer.id));
                this.successNavigation.click();
            } else {
                this.dispatchEvent(
                    new CustomEvent("mossa-sell:success", {
                        bubbles: true,
                        composed: true,
                        detail: { offerId: offer.id },
                    }),
                );
            }
        } finally {
            this.setBusy(false);
        }
    }

    private validate(): string | null {
        return this.validateStep(1) || this.validateStep(2) || this.validateStep(3);
    }

    private validateStep(step: number): string | null {
        if (step === 1 && !this.product) {
            return this.copy("chooseProduct");
        }
        if (step === 1 && this.variantRequired && !this.variantId) {
            const missingAxis = this.variantAxes.find((axis) => !this.variantSelections.has(axis.key));
            return missingAxis
                ? this.copy("provide", { label: missingAxis.label || missingAxis.key })
                : this.copy("chooseExactVariant");
        }
        if (step === 2 && !this.condition) {
            return this.copy("chooseCondition");
        }
        if (step !== 3) {
            return null;
        }
        if (this.files.length < this.minimumPhotos || this.files.length > this.maximumPhotos) {
            return this.copy(
                this.minimumPhotos === this.maximumPhotos ? "invalidPhotoCountExact" : "invalidPhotoCountRange",
                { minimum: String(this.minimumPhotos), maximum: String(this.maximumPhotos) },
            );
        }
        const invalid = this.files.find(
            (file) =>
                !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
                file.size > 5 * 1024 * 1024,
        );
        return invalid ? this.copy("invalidImage", { name: invalid.name }) : null;
    }

    private async request(path: string, init: RequestInit = {}): Promise<SourceRecord> {
        const response = await fetch(path, {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
                ...(init.headers || {}),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new RemoteRequestError(responseMessage(body), response.status);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error();
        }
        return body;
    }

    private fail(error: unknown, fallback?: string) {
        this.setStatus(fallback || this.copy("unable"), "error");
    }
    private setStatus(message: string, state = "idle") {
        this.status.textContent = message;
        this.status.dataset.state = state;
    }
    private setBusy(busy: boolean, message?: string) {
        this.submit.disabled = busy;
        if (message) {
            this.setStatus(message);
        }
    }

    private get form() {
        return this.shadowRoot!.querySelector("form")!;
    }
    private get search() {
        return this.shadowRoot!.querySelector<FormFieldElement>("#product-search")!;
    }
    private get results() {
        return this.shadowRoot!.querySelector<HTMLElement>(".results")!;
    }
    private get selected() {
        return this.shadowRoot!.querySelector<HTMLElement>(".selected-product")!;
    }
    private get variantWrap() {
        return this.shadowRoot!.querySelector<HTMLElement>(".variant")!;
    }
    private get variantFields() {
        return this.shadowRoot!.querySelector<HTMLElement>(".variant-fields")!;
    }
    private get grades() {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLInputElement>('[name="condition"]'));
    }
    private get conditionOptions() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-condition-options]")!;
    }
    private get condition() {
        return this.grades.find((input) => input.checked)?.value || "";
    }
    private get conditionLabel() {
        const selected = this.grades.find((input) => input.checked);
        return selected?.dataset.label || selected?.value.replaceAll("_", " ") || "";
    }
    private get estimateValue() {
        return this.shadowRoot!.querySelector<HTMLElement>(".estimate-value")!;
    }
    private get estimateDetail() {
        return this.shadowRoot!.querySelector<HTMLElement>(".estimate-detail")!;
    }
    private get description() {
        return this.shadowRoot!.querySelector<FormFieldElement>("#description")!;
    }
    private get photosUpload() {
        return this.shadowRoot!.querySelector<HTMLInputElement>(".photos-upload")!;
    }
    private get photoPreviews() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-photo-previews]")!;
    }
    private get photoCount() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-photo-count]")!;
    }
    private get photoHint() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-photo-hint]")!;
    }
    private get photoPicker() {
        return this.shadowRoot!.querySelector<HTMLElement>(".photo-picker")!;
    }
    private get photoPickerLabel() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-photo-picker-label]")!;
    }
    private get authGate() {
        return this.shadowRoot!.querySelector<HTMLElement>(".auth-gate")!;
    }
    private get authLink() {
        return this.querySelector<HTMLAnchorElement>(':scope > a[slot="auth-link"]')!;
    }
    private get successNavigation() {
        return this.querySelector<HTMLAnchorElement>(':scope > a[slot="success-navigation"]')!;
    }
    private get sellerDetails() {
        return this.shadowRoot!.querySelector<HTMLElement>(".seller-details")!;
    }
    private get submit() {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".submit")!;
    }
    private get status() {
        return this.shadowRoot!.querySelector<HTMLElement>(".status")!;
    }
    private get steps() {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>("[data-step]"));
    }
    private get nextButtons() {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-next]"));
    }
    private get editButtons() {
        return Array.from(this.shadowRoot!.querySelectorAll<HTMLButtonElement>("[data-edit]"));
    }
    private get maximumPhotos() {
        return boundedPhotoCount(this.getAttribute("maximum-photos"), 5);
    }
    private get minimumPhotos() {
        return Math.min(boundedPhotoCount(this.getAttribute("minimum-photos"), 3), this.maximumPhotos);
    }
    private copy(name: string, replacements: Readonly<Record<string, string>> = {}): string {
        const slotName = `copy-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
        const slot = this.shadowRoot?.querySelector<HTMLSlotElement>(`slot[name="${slotName}"]`);
        let value =
            slot
                ?.assignedNodes({ flatten: true })
                .map((node) => node.textContent || "")
                .join("")
                .trim() || "";
        for (const [key, replacement] of Object.entries(replacements)) {
            value = value.replaceAll(`{${key}}`, replacement);
        }
        return value;
    }
    private applyCopy = () => {
        this.shadowRoot?.querySelectorAll<HTMLElement>("[data-copy]").forEach((element) => {
            element.textContent = this.copy(element.dataset.copy || "");
        });
        this.search.setAttribute("label", this.copy("model"));
        this.search.setAttribute("placeholder", this.copy("searchPlaceholder"));
        this.results.setAttribute("aria-label", this.copy("model"));
        this.description.setAttribute("label", this.copy("description"));
        this.description.setAttribute("placeholder", this.copy("descriptionPlaceholder"));
    };
    private get copySlots(): HTMLSlotElement[] {
        return Array.from(this.shadowRoot?.querySelectorAll<HTMLSlotElement>('slot[name^="copy-"]') ?? []);
    }
    private get currency(): string {
        return (this.getAttribute("currency")?.trim() || "USD").toUpperCase();
    }
    private get minimumField(): string {
        return this.getAttribute("valuation-minimum-field")?.trim() || "valuationMinimum";
    }
    private get maximumField(): string {
        return this.getAttribute("valuation-maximum-field")?.trim() || "valuationMaximum";
    }
}

function resolveVariantAxes(declaredAxes: VariantAxis[] | undefined, variants: Variant[]): VariantAxis[] {
    const declared = (declaredAxes || [])
        .filter((axis) => typeof axis.key === "string" && axis.key.trim())
        .map((axis) => ({ ...axis, key: axis.key.trim() }))
        .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    if (
        declared.length > 0 &&
        variants.every((variant) => declared.every((axis) => Boolean(variantChoice(variant, axis.key))))
    ) {
        return declared;
    }

    const derived = new Map<string, VariantAxis>();
    for (const variant of variants) {
        for (const choice of variant.choices || []) {
            if (!choice.axisKey || derived.has(choice.axisKey)) {
                continue;
            }
            derived.set(choice.axisKey, {
                key: choice.axisKey,
                label: choice.axisLabel || choice.axisKey,
                position: derived.size,
            });
        }
    }
    const axes = [...derived.values()];
    return axes.length > 0 &&
        variants.every((variant) => axes.every((axis) => Boolean(variantChoice(variant, axis.key))))
        ? axes
        : [];
}

function variantChoice(variant: Variant, axisKey: string): VariantChoice | null {
    return variant.choices?.find((choice) => choice.axisKey === axisKey) ?? null;
}

function uniqueVariantChoices(variants: Variant[], axisKey: string): VariantChoice[] {
    const choices = new Map<string, VariantChoice>();
    for (const variant of variants) {
        const choice = variantChoice(variant, axisKey);
        if (choice?.valueKey && !choices.has(choice.valueKey)) {
            choices.set(choice.valueKey, choice);
        }
    }
    return [...choices.values()];
}

function productValuation(
    metadata: unknown,
    minimumField: string,
    maximumField: string,
): { minimum: number; maximum: number } | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }
    const values = metadata as SourceRecord;
    const minimum = metadataNumber(values[minimumField]);
    const maximum = metadataNumber(values[maximumField]);
    if (minimum === null || maximum === null || minimum < 0 || maximum < minimum) {
        return null;
    }
    return { minimum, maximum };
}
function metadataNumber(value: unknown): number | null {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function money(amount: number, currency: string, locale: string) {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(Math.round(amount));
}

function formattingLocale(): string {
    return document.documentElement.lang.trim() || navigator.language || "en-US";
}
function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
}
function boundedPhotoCount(value: unknown, fallback: number) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 20 ? parsed : fallback;
}
function slugify(value: string) {
    return (
        value
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 120) || "product"
    );
}
function responseMessage(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = (body as SourceRecord).error ?? (body as SourceRecord).message;
    return typeof value === "string" ? value.trim() : "";
}
