import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { createBlocUsageResolver, expandCompositions } from "@bernouy/cms-content";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    syncPresentation,
    syncRenderedOffers,
} from "@bernouy/cms-official-integrations/integrations/mossa/blocs/domains/commerce/accounts/commerce-account-offers/controller/presentation.ts";
import { declaredBlocViewSources } from "../../../../../../tests/helpers/blocArtifactSource";

async function commerceWithMossaBlocs() {
    const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
    const [commerce, mossa] = await Promise.all([repository.get("commerce"), repository.get("mossa")]);
    if (!commerce || !mossa) {
        throw new Error("Commerce or Mossa definition not found");
    }
    return { ...commerce, artifacts: [...(commerce.artifacts ?? []), ...(mossa.artifacts ?? [])] };
}

describe("Mossa Commerce account offers", () => {
    test("localizes populated offer dates, pending prices and pagination through optional copy", () => {
        const host = document.createElement("section") as HTMLElement & Record<string, any>;
        host.status = "all";
        host.page = 2;
        host.statusLabel = (status: string) => status;
        host.offerAction = () => ({ label: "View", url: "/offer" });
        host.innerHTML = `<article data-offer-card><span data-offer-price data-display-amount=""></span><time data-offer-updated data-date="2026-09-06T12:00:00Z"></time><a data-edit-button></a></article><mossa-pagination data-pagination></mossa-pagination>`;
        host.setAttribute("locale", "en-US");
        host.setAttribute("pending-price-label", "Awaiting price");
        host.setAttribute("updated-on-template", "Changed {date}");
        for (const [name, value] of Object.entries({
            "previous-label": "Back",
            "next-label": "Forward",
            "summary-template": "{page}/{pages}",
            tone: "neutral",
        })) {
            host.setAttribute(`pagination-${name}`, value);
        }
        syncPresentation(host, 12);
        syncRenderedOffers(host);
        expect(host.querySelector("[data-offer-price]")?.textContent).toBe("Awaiting price");
        expect(host.querySelector("[data-offer-updated]")?.textContent).toBe("Changed Sep 6, 2026");
        const pagination = host.querySelector("[data-pagination]")!;
        expect(pagination.getAttribute("page")).toBe("2");
        expect(pagination.getAttribute("previous-label")).toBe("Back");
        expect(pagination.getAttribute("next-label")).toBe("Forward");
        expect(pagination.getAttribute("summary-template")).toBe("{page}/{pages}");
        expect(pagination.getAttribute("tone")).toBe("neutral");
        host.removeAttribute("pending-price-label");
        host.removeAttribute("updated-on-template");
        syncRenderedOffers(host);
        expect(host.querySelector("[data-offer-price]")?.textContent).toBe("Price pending");
        expect(host.querySelector("[data-offer-updated]")?.textContent).toBe("Updated on Sep 6, 2026");
    });

    test("waits for a resolved positive media id before publishing a seller image binding", () => {
        const host = document.createElement("section") as HTMLElement & Record<string, any>;
        host.status = "all";
        host.statusLabel = (status: string) => status;
        host.offerAction = () => ({ label: "View", url: "/offer" });
        host.innerHTML = `
            <article data-offer-card>
                <img data-offer-image data-media-id="{{ offer.mainImageMediaId }}">
                <a data-edit-button data-workflow-state="online"></a>
            </article>
        `;

        const image = host.querySelector<HTMLImageElement>("[data-offer-image]")!;
        syncRenderedOffers(host);
        expect(image.hasAttribute("src")).toBeFalse();
        expect(image.hidden).toBeTrue();

        image.setAttribute("data-media-id", "42");
        syncRenderedOffers(host);
        expect(image.getAttribute("data-cms-src")).toBe("/.cms/sources/commerce/myOfferImage?id=42");
        expect(image.hasAttribute("src")).toBeFalse();
        expect(image.hidden).toBeFalse();

        image.setAttribute("data-media-id", "42&unexpected=true");
        syncRenderedOffers(host);
        expect(image.hasAttribute("data-cms-src")).toBeFalse();
        expect(image.hasAttribute("src")).toBeFalse();
        expect(image.hidden).toBeTrue();
    });

    test("only exposes the public offer action when the backend marks the offer visible", () => {
        const host = document.createElement("section") as HTMLElement & Record<string, any>;
        host.status = "all";
        host.statusLabel = (status: string) => status;
        host.offerAction = (_workflowState: string, publiclyVisible: boolean) =>
            publiclyVisible ? { label: "View", url: "/offer?slug={slug}" } : null;
        host.innerHTML = `
            <article data-offer-card>
                <a data-edit-button data-offer-id="41" data-offer-slug="visible" data-workflow-state="approved" data-publicly-visible="true"></a>
            </article>
            <article data-offer-card>
                <a data-edit-button data-offer-id="42" data-offer-slug="pending" data-workflow-state="pending_review" data-publicly-visible="false" href="/offer?slug=pending"></a>
            </article>
        `;

        syncRenderedOffers(host);

        const [visible, pending] = host.querySelectorAll<HTMLElement>("[data-edit-button]");
        expect(visible.hidden).toBeFalse();
        expect(visible.getAttribute("href")).toBe("/offer?slug=visible");
        expect(pending.hidden).toBeTrue();
        expect(pending.hasAttribute("href")).toBeFalse();
    });

    test("renders the exact published seller consent once with its document link", async () => {
        const definition = await commerceWithMossaBlocs();
        const composition = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-price-form",
        );
        const controller = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-price-form-controller",
        );
        if (
            !composition ||
            composition.type !== "bloc" ||
            composition.bloc.compositionHTML === undefined ||
            !controller ||
            controller.type !== "bloc" ||
            !controller.bloc.viewJS
        ) {
            throw new Error("mossa-commerce-offer-price-form composition sources not found");
        }
        const tag = controller.bloc.tag;
        if (!customElements.get(tag)) {
            Object.assign(((window as Window & { p9r?: Record<string, unknown> }).p9r ??= {}), { Component });
            const compiled = await prepare_bloc(
                new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
                null,
                controller.bloc.name,
                controller.bloc.group ?? "Commerce",
                controller.bloc.description ?? "",
                tag,
                controller.bloc.source,
                undefined,
                { viewPath: "controller/Bloc.ts" },
            );
            new Function(compiled.viewJS)();
        }
        const expanded = document.createElement("div");
        expanded.innerHTML = `<mossa-commerce-offer-price-form></mossa-commerce-offer-price-form>`;
        expandCompositions(expanded, [{ id: composition.bloc.tag, compositionHTML: composition.bloc.compositionHTML }]);
        const fragment = document.createElement("template");
        fragment.innerHTML = expanded.innerHTML;
        const form = fragment.content.querySelector(tag) as HTMLElement & {
            sellerTermsRequirement: Record<string, unknown>;
            activationRequired: boolean;
            load(): Promise<void>;
            syncPresentation(): void;
        };
        form.load = async () => {};
        document.body.append(fragment.content);
        form.sellerTermsRequirement = {
            mode: "published_page",
            version: "cms-page:revision-1",
            hash: "a".repeat(64),
            label: "Platform seller terms",
            consentText: "I accept the Platform seller terms.",
            page: { path: "/seller-terms" },
        };
        form.activationRequired = true;
        form.syncPresentation();

        const sellerConsent = form.querySelector("[data-seller-consent]");
        const links = sellerConsent?.querySelectorAll<HTMLAnchorElement>("[data-seller-terms-link]") ?? [];
        expect(sellerConsent?.textContent).toBe("I accept the Platform seller terms.");
        expect(links).toHaveLength(1);
        expect(links[0]?.pathname).toBe("/seller-terms");
        expect(form.querySelector("[data-stripe-consent-fragment]")?.textContent).toContain("payment service terms");
        expect(form.querySelector("[data-stripe-consent-fragment]")?.textContent).not.toContain("Stripe");
        expect(form.querySelector("mossa-button[data-technical-retry] > button[data-retry]")?.textContent).toBe(
            "Try again",
        );
        form.remove();
    });

    test("provides transparent public offer list and editable offer preview blocs", async () => {
        const definition = await commerceWithMossaBlocs();
        const artifacts =
            definition.artifacts?.filter(
                (item) =>
                    item.type === "bloc" &&
                    ["mossa-commerce-offer-list", "mossa-commerce-offer-preview"].includes(item.bloc.tag),
            ) ?? [];
        expect(artifacts).toHaveLength(2);

        const compiled = new Map<string, Awaited<ReturnType<typeof prepare_bloc>>>();
        for (const artifact of artifacts) {
            if (artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) {
                continue;
            }
            compiled.set(
                artifact.bloc.tag,
                await prepare_bloc(
                    new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
                    new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "text/typescript" }),
                    artifact.bloc.name,
                    artifact.bloc.group ?? "Commerce",
                    artifact.bloc.description ?? "",
                    artifact.bloc.tag,
                    artifact.bloc.source,
                ),
            );
        }

        const list = compiled.get("mossa-commerce-offer-list");
        const preview = compiled.get("mossa-commerce-offer-preview");
        const listArtifact = artifacts.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-list",
        );
        const listDefault =
            listArtifact?.type === "bloc"
                ? Buffer.from(listArtifact.bloc.source?.["default.html"] ?? "", "base64").toString("utf-8")
                : "";
        const previewArtifact = artifacts.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-preview",
        );
        const previewStyles =
            previewArtifact?.type === "bloc"
                ? Buffer.from(previewArtifact.bloc.source?.["style.css"] ?? "", "base64").toString("utf-8")
                : "";
        const listViewSource = listArtifact?.type === "bloc" ? declaredBlocViewSources(listArtifact.bloc) : "";
        const listEditorSource = listArtifact?.type === "bloc" ? (listArtifact.bloc.editorJS ?? "") : "";
        const previewViewSource = previewArtifact?.type === "bloc" ? declaredBlocViewSources(previewArtifact.bloc) : "";
        const previewEditorSource = previewArtifact?.type === "bloc" ? (previewArtifact.bloc.editorJS ?? "") : "";
        expect(listViewSource).toContain('this.setAttribute("cms-source", source)');
        expect(listViewSource).toContain(
            'host.querySelectorAll("[cms-param-sync], [data-commerce-param][data-url-param]")',
        );
        expect(list?.viewJS).toContain("mossa-pagination:change");
        expect(listViewSource).toContain('host.getAttribute("grid-min") || "md"');
        expect(listViewSource).toContain('host.getAttribute("grid-max") || "lg"');
        expect(listViewSource).toContain('host.getAttribute("grid-packing") || "fill"');
        expect(listViewSource).toContain('card.toggleAttribute("stretch", stretch)');
        expect(listDefault).toContain('cms-repeat="data.items as offer"');
        expect(listDefault).toContain('<img slot="media"');
        expect(listDefault).toContain('data-source-image-access="public"');
        expect(listDefault).toContain('grid-min="md" grid-max="lg"');
        expect(listDefault).toContain('grid-packing="fill"');
        expect(listDefault.match(/data-offers-grid/g)).toHaveLength(2);
        expect(listDefault).toContain("stretch data-offer-card");
        expect(listEditorSource).toContain('attribute: "page-size"');
        expect(listEditorSource).toContain('attribute: "grid-min"');
        expect(listEditorSource).toContain('attribute: "grid-max"');
        expect(listEditorSource).toMatch(/attribute: "grid-max",\s+defaultValue: "lg"/);
        expect(listEditorSource).toMatch(/attribute: "grid-packing",\s+defaultValue: "fill"/);
        expect(listEditorSource).toContain('attribute: "card-stretch"');
        expect(listEditorSource).toContain('label: "Catalogue content"');
        expect(previewViewSource).toContain("new Intl.NumberFormat");
        expect(preview?.viewJS).toContain('slot name="media"');
        expect(preview?.viewJS).toContain('slot name="price"');
        expect(preview?.viewJS).toContain('slot name="navigation"');
        expect(preview?.viewJS).toContain("@media (prefers-reduced-motion: reduce)");
        expect(preview?.viewJS).not.toContain("@media (max-width");
        expect(previewEditorSource).not.toContain('type: "color"');
        expect(previewEditorSource).toContain('attribute: "stretch"');
        expect(previewStyles).toContain(':host([stretch]:not([stretch="false"]))');

        const source = definition.artifacts?.find((item) => item.type === "source");
        if (!source || source.type !== "source") {
            throw new Error("commerce source not found");
        }
        const endpoint = source.source.endpoints.find((item) => item.endpointId === "offers");
        const publicOffersBody = endpoint?.output?.[0]?.body;
        expect(publicOffersBody).toMatchObject({
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            mainImageMediaId: { type: "string" },
                            media: { type: "array" },
                            product: {
                                type: "object",
                                properties: { metadata: { type: "object" } },
                            },
                        },
                    },
                },
            },
        });
        if (publicOffersBody?.type !== "object") {
            throw new Error("public offers output is not an object");
        }
        const publicOfferShape = publicOffersBody.properties?.items;
        if (publicOfferShape?.type !== "array" || publicOfferShape.items?.type !== "object") {
            throw new Error("public offer item output is missing");
        }
        expect(publicOfferShape.items.properties).not.toHaveProperty("seller");
        expect(publicOfferShape.items.properties).not.toHaveProperty("sellerId");
        expect(publicOfferShape.items.properties).not.toHaveProperty("sellerDisplayPriceAmount");
    });

    test("compiles as a configurable Light DOM composition backed by listMyOffers", async () => {
        const definition = await commerceWithMossaBlocs();
        const artifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-offers",
        );
        const controller = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-account-offers-controller",
        );
        if (
            !artifact ||
            artifact.type !== "bloc" ||
            artifact.bloc.compositionHTML === undefined ||
            !artifact.bloc.editorJS ||
            !controller ||
            controller.type !== "bloc" ||
            !controller.bloc.viewJS
        ) {
            throw new Error("mossa-commerce-account-offers sources not found");
        }

        const compiledController = await prepare_bloc(
            new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controller.bloc.name,
            controller.bloc.group ?? "Commerce",
            controller.bloc.description ?? "",
            controller.bloc.tag,
            controller.bloc.source,
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );
        const resolveUsage = createBlocUsageResolver(
            [
                "mossa-button",
                "mossa-surface-card",
                "mossa-responsive-grid",
                "mossa-option",
                "mossa-pagination",
                "mossa-select",
                "mossa-skeleton",
                "mossa-stack",
                "mossa-toast",
                "mossa-commerce-account-offers",
                "mossa-commerce-account-offers-controller",
                "img",
            ].map((id) => ({
                id,
                ...(id === "mossa-commerce-account-offers" ? { compositionHTML: artifact.bloc.compositionHTML } : {}),
            })),
            {
                getBlocViewJS: async (tag) =>
                    tag === "mossa-commerce-account-offers-controller" ? compiledController.viewJS : null,
            },
        );
        const viewSource = declaredBlocViewSources(controller.bloc);
        const editorSource = artifact.bloc.editorJS;
        const runtimeSource = `${artifact.bloc.compositionHTML}\n${compiledController.viewJS}`;

        expect(definition.dependencies).toEqual([
            { name: "emailer", kind: "emailer", optional: true, versionRange: "^1.0.0" },
            { name: "consent", kind: "consent", versionRange: "^1.0.0" },
        ]);
        expect(compiledController.viewJS).toContain("window.p9r.Component");
        expect(runtimeSource).toContain('cms-repeat="items as offer"');
        expect(runtimeSource).toContain('<img slot="media"');
        expect(runtimeSource).toContain("/listMyOffers?status=");
        expect(runtimeSource).toContain("mossa-pagination:change");
        expect(viewSource).toContain('host.getAttribute("grid-packing") || "fit"');
        expect(viewSource).toContain('host.getAttribute("image-fit") || "cover"');
        expect(viewSource).toContain('host.getAttribute("image-height") || "12rem"');
        expect(viewSource).toContain('card.toggleAttribute("stretch"');
        expect(runtimeSource).toContain("history.replaceState");
        expect(viewSource).toContain('attributeFilter: ["data-media-id", "data-source-height", "data-source-width"]');
        expect(viewSource).toContain('positiveIdentifier(image?.getAttribute("data-media-id"))');
        expect(runtimeSource).toContain('data-offer-slug="{{ offer.slug }}"');
        expect(runtimeSource).toContain('data-publicly-visible="{{ offer.publiclyVisible }}"');
        expect(runtimeSource).toContain('data-display-amount="{{ offer.sellerDisplayPriceAmount }}"');
        expect(runtimeSource).not.toContain('data-amount="{{ offer.acceptedPriceAmount }}"');
        expect(runtimeSource).toContain('replaceAll("{slug}"');
        expect(runtimeSource).toContain(
            '<mossa-stack direction="row" justify-content="space-between" align-items="end" wrap="true"',
        );
        expect(runtimeSource).toContain('accessible-label="Filter by status"');
        expect(runtimeSource).toContain('data-empty-state cms-condition="total == 0"');
        expect(runtimeSource).toContain('cms-condition="total > limit"');
        expect(runtimeSource).not.toContain("<cms-binding-core");
        expect(runtimeSource).not.toContain("<style>");
        expect(editorSource).toContain('attribute: "page-size"');
        expect(editorSource).toContain('attribute: "grid-packing"');
        expect(editorSource).toContain('attribute: "image-fit"');
        expect(editorSource).toContain('attribute: "label-action-required"');
        expect(editorSource).not.toContain('type: "color"');
        expect(await resolveUsage("<mossa-commerce-account-offers></mossa-commerce-account-offers>")).toEqual([
            "img",
            "mossa-button",
            "mossa-commerce-account-offers",
            "mossa-commerce-account-offers-controller",
            "mossa-option",
            "mossa-pagination",
            "mossa-responsive-grid",
            "mossa-select",
            "mossa-skeleton",
            "mossa-stack",
            "mossa-surface-card",
            "mossa-toast",
        ]);

        const source = definition.artifacts?.find((item) => item.type === "source");
        if (!source || source.type !== "source") {
            throw new Error("commerce source not found");
        }
        const endpoint = source.source.endpoints.find((item) => item.endpointId === "listMyOffers");
        expect(endpoint?.access).toEqual({ mode: "auth" });
        expect(endpoint?.params?.map((param) => param.name)).toEqual([
            "status",
            "publicationStatus",
            "workflowState",
            "limit",
            "offset",
        ]);
        expect(endpoint?.output?.[0]?.body).toMatchObject({
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            displayStatus: { type: "string" },
                            publiclyVisible: { type: "boolean" },
                            mainImageMediaId: { type: "string" },
                            sellerDisplayPriceAmount: { type: "number" },
                        },
                    },
                },
                total: { type: "number" },
                limit: { type: "number" },
                offset: { type: "number" },
            },
        });
        const manageEndpoint = source.source.endpoints.find((item) => item.endpointId === "manageOffers");
        const manageItems =
            manageEndpoint?.output?.[0]?.body?.type === "object"
                ? manageEndpoint.output[0].body.properties?.items
                : undefined;
        if (manageItems?.type !== "array" || manageItems.items?.type !== "object") {
            throw new Error("admin offer list output is missing");
        }
        expect(manageItems.items.properties).not.toHaveProperty("sellerDisplayPriceAmount");
    });

    test("provides a seller price form backed by the offer price workflow", async () => {
        const definition = await commerceWithMossaBlocs();
        const artifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-price-form",
        );
        const controller = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-price-form-controller",
        );
        if (
            !artifact ||
            artifact.type !== "bloc" ||
            artifact.bloc.compositionHTML === undefined ||
            !artifact.bloc.editorJS ||
            !controller ||
            controller.type !== "bloc" ||
            !controller.bloc.viewJS
        ) {
            throw new Error("mossa-commerce-offer-price-form sources not found");
        }

        const compiledController = await prepare_bloc(
            new File([controller.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            controller.bloc.name,
            controller.bloc.group ?? "Commerce",
            controller.bloc.description ?? "",
            controller.bloc.tag,
            controller.bloc.source,
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );
        const defaultContent = Buffer.from(artifact.bloc.source?.["default.html"] ?? "", "base64").toString("utf-8");
        const manifest = JSON.parse(
            Buffer.from(artifact.bloc.source?.["manifest.json"] ?? "", "base64").toString("utf-8"),
        );
        const resolveUsage = createBlocUsageResolver(
            [
                "mossa-button",
                "mossa-surface-card",
                "mossa-responsive-grid",
                "mossa-input",
                "mossa-skeleton",
                "mossa-stack",
                "mossa-toast",
                "mossa-commerce-offer-price-form",
                "mossa-commerce-offer-price-form-controller",
            ].map((id) => ({
                id,
                ...(id === "mossa-commerce-offer-price-form" ? { compositionHTML: artifact.bloc.compositionHTML } : {}),
            })),
            {
                getBlocViewJS: async (tag) =>
                    tag === "mossa-commerce-offer-price-form-controller" ? compiledController.viewJS : null,
            },
        );
        const viewSource = declaredBlocViewSources(controller.bloc);
        const editorSource = artifact.bloc.editorJS;
        const runtimeSource = `${artifact.bloc.compositionHTML}\n${compiledController.viewJS}`;

        expect(compiledController.viewJS).toContain("window.p9r.Component");
        expect(runtimeSource).toContain("myOffer?id=");
        expect(runtimeSource).toContain("getSellerSaleEnrollment");
        expect(runtimeSource).toContain("submitSellerOfferPrice");
        expect(viewSource).toContain('workflowState !== "awaiting_seller_price"');
        expect(viewSource).toContain("majorToMinor");
        expect(viewSource).toContain("marketplaceTermsCurrentVersionAccepted");
        expect(viewSource).toContain(
            "this.sellerTermsRequirement = marketplaceTermsRequirement(connect?.marketplaceTermsRequirement)",
        );
        expect(viewSource).toContain("publishedMarketplaceTermsRequirement(this.sellerTermsRequirement)");
        expect(viewSource).toContain("publishedTerms?.consentText");
        expect(viewSource).toContain("publishedTerms?.label");
        expect(viewSource).toContain("publishedTerms?.page.path");
        expect(viewSource).toContain("renderLinkedConsent(");
        expect(viewSource).toContain("this.sellerConsent");
        expect(viewSource).toContain("if (!this.consent.checked)");
        expect(viewSource).toContain("payload.sellerTermsVersion = this.sellerTermsRequirement.version");
        expect(viewSource).toContain("payload.sellerTermsHash = this.sellerTermsRequirement.hash");
        expect(viewSource).toContain('error.message === "MARKETPLACE_TERMS_VERSION_CHANGED"');
        expect(viewSource).toContain("await this.load()");
        expect(viewSource).toContain("Seller terms changed. Review the new version before continuing.");
        expect(viewSource).toContain('accountStatus === "active"');
        expect(viewSource).toContain('stripeAccountApiVersion === "v2"');
        expect(viewSource).toContain("applicationControlledRecipient === true");
        expect(viewSource).toContain('stripeTermsStatus === "accepted"');
        expect(runtimeSource).toContain("getConnectClientConfig");
        expect(viewSource).toContain('STRIPE_V2_API = "https://api.stripe.com/v2"');
        expect(runtimeSource).toContain("/core/account_tokens");
        expect(viewSource).toContain('"stripe-version": STRIPE_V2_VERSION');
        expect(viewSource).toContain("country: profile.countryCode.toLowerCase()");
        expect(viewSource).toContain('this.requestEndpoint("updateAccount"');
        expect(viewSource).toContain("payload.accountToken");
        expect(viewSource).toContain("payload.sellerTermsAccepted = true");
        expect(runtimeSource).toContain('data-profile-control="givenName"');
        expect(runtimeSource).toContain('data-profile-control="birthDate"');
        expect(runtimeSource).toContain('data-profile-control="countryCode"');
        expect(runtimeSource).toContain('name="email" type="email" autocomplete="email" required');
        expect(runtimeSource).not.toContain('name="email" type="email" autocomplete="email" readonly');
        expect(viewSource).toContain("email: textValue(accountProfile?.email)");
        expect(viewSource).toContain("control.hidden = profileFieldReady");
        expect(runtimeSource).not.toContain("data-profile-link");
        expect(viewSource).not.toContain("profileLink");
        expect(runtimeSource).toContain('name="sellerTermsAccepted" type="checkbox"');
        expect(viewSource).toContain("this.stripeConsentFragment.hidden = !this.enrollmentRequired");
        expect(viewSource).toContain("if (!this.templateReady)");
        expect(runtimeSource).toContain("platform seller terms");
        expect(runtimeSource).toContain("The information provided is processed");
        expect(runtimeSource).toContain("Read the privacy notice");
        expect(runtimeSource).toContain("Accept the platform seller terms and payment service terms to continue.");
        expect(runtimeSource).not.toContain("accord de compte connecté Stripe");
        expect(runtimeSource).toContain("Accept the platform seller terms to continue.");
        expect(runtimeSource).toContain("sessionStorage.setItem");
        expect(runtimeSource).not.toContain("history.pushState");
        expect(runtimeSource).not.toContain("submitMyOfferPrice?id=");
        expect(runtimeSource).not.toContain("eligibility-ensure-function-id");
        expect(runtimeSource).not.toContain("payoutEligible");
        expect(runtimeSource).not.toContain("canReceiveProtectedPayments");
        expect(runtimeSource).not.toContain("payoutsEnabled");
        expect(runtimeSource).not.toContain("verificationStatus");
        expect(runtimeSource).not.toContain("bankAccountToken");
        expect(runtimeSource).not.toContain("createBankAccountToken");
        expect(runtimeSource).not.toContain("contactEmail");
        expect(runtimeSource).not.toContain("l’accord Stripe et la politique de confidentialité");
        expect(runtimeSource).not.toContain("data-stripe-consent-fragment hidden");
        expect(runtimeSource.toLowerCase()).not.toContain("iban");
        expect(runtimeSource).not.toContain("synchronizeSellerPayoutEligibility");
        expect(runtimeSource).toContain("commerce-offer-price:submitted");
        expect(editorSource).toContain('attribute: "success-url"');
        expect(editorSource).toContain('attribute: "range-message"');
        expect(editorSource).not.toContain('attribute: "enrollment-function-id"');
        expect(editorSource).not.toContain('attribute: "stripe-source-id"');
        expect(editorSource).toContain('attribute: "seller-terms-url"');
        expect(editorSource).toContain('attribute: "privacy-url"');
        expect(editorSource).toContain('attribute: "privacy-notice"');
        expect(editorSource).toContain('attribute: "privacy-link-label"');
        expect(editorSource).not.toContain('attribute: "profile-link-label"');
        expect(editorSource).not.toContain('attribute: "profile-url"');
        expect(editorSource).toContain('attribute: "first-enrollment-consent-required-message"');
        expect(editorSource).toContain('attribute: "seller-terms-consent-required-message"');
        expect(editorSource).not.toContain('attribute: "privacy-label"');
        expect(editorSource).not.toContain('attribute: "consent-required-message"');
        expect(defaultContent).not.toContain("enrollment-function-id=");
        expect(defaultContent).not.toContain("submit-function-id=");
        expect(defaultContent).not.toContain("seller-terms-url=");
        expect(defaultContent).toContain('stripe-terms-url="https://stripe.com/connect-account/legal"');
        expect(defaultContent).not.toContain("privacy-url=");
        expect(defaultContent).not.toContain("profile-url=");
        expect(manifest.meta.description).toContain("privacy information separately");
        expect(manifest.meta.description).toContain("configured explicitly");
        expect(await resolveUsage("<mossa-commerce-offer-price-form></mossa-commerce-offer-price-form>")).toEqual([
            "mossa-button",
            "mossa-commerce-offer-price-form",
            "mossa-commerce-offer-price-form-controller",
            "mossa-input",
            "mossa-responsive-grid",
            "mossa-skeleton",
            "mossa-stack",
            "mossa-surface-card",
            "mossa-toast",
        ]);

        const source = definition.artifacts?.find((item) => item.type === "source");
        if (!source || source.type !== "source") {
            throw new Error("commerce source not found");
        }
        expect(source.source.endpoints.find((item) => item.endpointId === "myOffer")?.access).toEqual({ mode: "auth" });
        expect(source.source.endpoints.find((item) => item.endpointId === "submitMyOfferPrice")?.access).toEqual({
            mode: "system",
        });
    });
});
