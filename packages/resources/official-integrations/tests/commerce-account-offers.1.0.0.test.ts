import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { syncRenderedOffers } from "../integrations/commerce/versions/1.0.0/blocs/commerce-account-offers/presentation";

describe("commerce account offers 1.0.0", () => {
    test("waits for a resolved positive media id before loading a seller image", () => {
        const host = document.createElement("section") as HTMLElement & Record<string, any>;
        host.sourceBase = "/.cms/sources/commerce";
        host.status = "all";
        host.statusLabel = (status: string) => status;
        host.offerAction = () => ({ label: "Voir", url: "/annonce" });
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
        expect(image.getAttribute("src")).toBe("/.cms/sources/commerce/myOfferImage?id=42");
        expect(image.hidden).toBeFalse();

        image.setAttribute("data-media-id", "42&unexpected=true");
        syncRenderedOffers(host);
        expect(image.hasAttribute("src")).toBeFalse();
        expect(image.hidden).toBeTrue();
    });

    test("provides transparent public offer list and editable offer preview blocs", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        if (!definition) throw new Error("commerce definition not found");
        const artifacts = definition.artifacts?.filter(item => (
            item.type === "bloc" && ["commerce-offer-list", "commerce-offer-preview"].includes(item.bloc.tag)
        )) ?? [];
        expect(artifacts).toHaveLength(2);

        const compiled = new Map<string, Awaited<ReturnType<typeof prepare_bloc>>>();
        for (const artifact of artifacts) {
            if (artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) continue;
            compiled.set(artifact.bloc.tag, await prepare_bloc(
                new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
                new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "text/typescript" }),
                artifact.bloc.name,
                artifact.bloc.group ?? "Commerce",
                artifact.bloc.description ?? "",
                artifact.bloc.tag,
                artifact.bloc.source,
            ));
        }

        const list = compiled.get("commerce-offer-list");
        const preview = compiled.get("commerce-offer-preview");
        const listArtifact = artifacts.find(item => item.type === "bloc" && item.bloc.tag === "commerce-offer-list");
        const listDefault = listArtifact?.type === "bloc"
            ? Buffer.from(listArtifact.bloc.source?.["default.html"] ?? "", "base64").toString("utf-8")
            : "";
        const previewArtifact = artifacts.find(item => item.type === "bloc" && item.bloc.tag === "commerce-offer-preview");
        const previewStyles = previewArtifact?.type === "bloc"
            ? Buffer.from(previewArtifact.bloc.source?.["style.css"] ?? "", "base64").toString("utf-8")
            : "";
        expect(list?.viewJS).toContain('this.setAttribute("cms-source", source)');
        expect(list?.viewJS).toContain('host.querySelectorAll("[cms-param-sync], [data-commerce-param][data-url-param]")');
        expect(list?.viewJS).toContain("basic-pagination:change");
        expect(list?.viewJS).toContain('host.getAttribute("grid-min") || "md"');
        expect(list?.viewJS).toContain('host.getAttribute("grid-max") || "xl"');
        expect(list?.viewJS).toContain('card.toggleAttribute("stretch", stretch)');
        expect(listDefault).toContain('cms-repeat="data.items as offer"');
        expect(listDefault).toContain('<img slot="media"');
        expect(listDefault).toContain('grid-min="md" grid-max="xl"');
        expect(listDefault.match(/data-offers-grid/g)).toHaveLength(2);
        expect(listDefault).toContain("stretch data-offer-card");
        expect(list?.editorJS).toContain('attribute: "page-size"');
        expect(list?.editorJS).toContain('attribute: "grid-min"');
        expect(list?.editorJS).toContain('attribute: "grid-max"');
        expect(list?.editorJS).toContain('attribute: "card-stretch"');
        expect(list?.editorJS).toContain('label: "Catalogue content"');
        expect(preview?.viewJS).toContain("new Intl.NumberFormat");
        expect(preview?.viewJS).toContain('slot name="media"');
        expect(preview?.viewJS).toContain('slot name="price"');
        expect(preview?.viewJS).not.toContain("@media");
        expect(preview?.editorJS).toContain('color("Price", "price-color")');
        expect(preview?.editorJS).toContain('attribute: "stretch"');
        expect(previewStyles).toContain(':host([stretch]:not([stretch="false"]))');

        const source = definition.artifacts?.find(item => item.type === "source");
        if (!source || source.type !== "source") throw new Error("commerce source not found");
        const endpoint = source.source.endpoints.find(item => item.endpointId === "offers");
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
        if (publicOffersBody?.type !== "object") throw new Error("public offers output is not an object");
        const publicOfferShape = publicOffersBody.properties?.items;
        if (publicOfferShape?.type !== "array" || publicOfferShape.items?.type !== "object") {
            throw new Error("public offer item output is missing");
        }
        expect(publicOfferShape.items.properties).not.toHaveProperty("seller");
        expect(publicOfferShape.items.properties).not.toHaveProperty("sellerId");
        expect(publicOfferShape.items.properties).not.toHaveProperty("sellerDisplayPriceAmount");
    });

    test("compiles as a configurable Light DOM composition backed by listMyOffers", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        if (!definition) throw new Error("commerce definition not found");
        const artifact = definition.artifacts?.find(item => item.type === "bloc" && item.bloc.tag === "commerce-account-offers");
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) {
            throw new Error("commerce-account-offers sources not found");
        }

        const compiled = await prepare_bloc(
            new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "text/typescript" }),
            artifact.bloc.name,
            artifact.bloc.group ?? "Commerce",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
        );
        const resolveUsage = createBlocUsageResolver(
            [
                "basic-button", "basic-card", "basic-grid", "basic-option", "basic-pagination",
                "basic-select", "basic-skeleton", "basic-stack", "basic-toast", "commerce-account-offers", "img",
            ].map(id => ({ id })),
            { getBlocViewJS: async tag => tag === "commerce-account-offers" ? compiled.viewJS : null },
        );

        expect(definition.dependencies).toEqual([{ name: "basicBlocs", kind: "basic-blocs" }]);
        expect(compiled.viewJS).toContain("window.p9r.Composition");
        expect(compiled.viewJS).toContain('cms-repeat="items as offer"');
        expect(compiled.viewJS).toContain('<img slot="media"');
        expect(compiled.viewJS).toContain("/listMyOffers?status=");
        expect(compiled.viewJS).toContain("basic-pagination:change");
        expect(compiled.viewJS).toContain('host.getAttribute("grid-packing") || "fit"');
        expect(compiled.viewJS).toContain('host.getAttribute("image-fit") || "cover"');
        expect(compiled.viewJS).toContain('host.getAttribute("image-height") || "12rem"');
        expect(compiled.viewJS).toContain('card.toggleAttribute("stretch"');
        expect(compiled.viewJS).toContain("history.replaceState");
        expect(compiled.viewJS).toContain('attributeFilter: ["data-media-id"]');
        expect(compiled.viewJS).toContain('positiveIdentifier(image?.getAttribute("data-media-id"))');
        expect(compiled.viewJS).toContain('data-offer-slug="{{ offer.slug }}"');
        expect(compiled.viewJS).toContain('data-display-amount="{{ offer.sellerDisplayPriceAmount }}"');
        expect(compiled.viewJS).not.toContain('data-amount="{{ offer.acceptedPriceAmount }}"');
        expect(compiled.viewJS).toContain('replaceAll("{slug}"');
        expect(compiled.viewJS).toContain('<basic-stack direction="row" justify-content="space-between" align-items="end" wrap="true"');
        expect(compiled.viewJS).toContain('accessible-label="Filtrer par statut"');
        expect(compiled.viewJS).toContain('data-empty-state cms-condition="total == 0"');
        expect(compiled.viewJS).toContain('cms-condition="total > limit"');
        expect(compiled.viewJS).not.toContain("<cms-binding-core");
        expect(compiled.viewJS).not.toContain("<style>");
        expect(compiled.editorJS).toContain('attribute: "page-size"');
        expect(compiled.editorJS).toContain('attribute: "grid-packing"');
        expect(compiled.editorJS).toContain('attribute: "image-fit"');
        expect(compiled.editorJS).toContain('attribute: "label-action-required"');
        expect(compiled.editorJS).toContain('color("Card background", "card-background-color")');
        expect(await resolveUsage("<commerce-account-offers></commerce-account-offers>"))
            .toEqual([
                "basic-button", "basic-card", "basic-grid", "basic-option", "basic-pagination",
                "basic-select", "basic-skeleton", "basic-stack", "basic-toast", "commerce-account-offers", "img",
            ]);

        const source = definition.artifacts?.find(item => item.type === "source");
        if (!source || source.type !== "source") throw new Error("commerce source not found");
        const endpoint = source.source.endpoints.find(item => item.endpointId === "listMyOffers");
        expect(endpoint?.access).toEqual({ mode: "auth" });
        expect(endpoint?.params?.map(param => param.name)).toEqual([
            "status", "publicationStatus", "workflowState", "limit", "offset",
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
        const manageEndpoint = source.source.endpoints.find(item => item.endpointId === "manageOffers");
        const manageItems = manageEndpoint?.output?.[0]?.body?.type === "object"
            ? manageEndpoint.output[0].body.properties?.items
            : undefined;
        if (manageItems?.type !== "array" || manageItems.items?.type !== "object") {
            throw new Error("admin offer list output is missing");
        }
        expect(manageItems.items.properties).not.toHaveProperty("sellerDisplayPriceAmount");
    });

    test("provides a seller price form backed by the offer price workflow", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        if (!definition) throw new Error("commerce definition not found");
        const artifact = definition.artifacts?.find(item => item.type === "bloc" && item.bloc.tag === "commerce-offer-price-form");
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS || !artifact.bloc.editorJS) {
            throw new Error("commerce-offer-price-form sources not found");
        }

        const compiled = await prepare_bloc(
            new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "text/typescript" }),
            artifact.bloc.name,
            artifact.bloc.group ?? "Commerce",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
        );
        const defaultContent = Buffer.from(artifact.bloc.source?.["default.html"] ?? "", "base64").toString("utf-8");
        const manifest = JSON.parse(Buffer.from(artifact.bloc.source?.["manifest.json"] ?? "", "base64").toString("utf-8"));
        const resolveUsage = createBlocUsageResolver(
            [
                "basic-button", "basic-card", "basic-grid", "basic-input", "basic-skeleton",
                "basic-stack", "basic-toast", "commerce-offer-price-form",
            ].map(id => ({ id })),
            { getBlocViewJS: async tag => tag === "commerce-offer-price-form" ? compiled.viewJS : null },
        );

        expect(compiled.viewJS).toContain("window.p9r.Composition");
        expect(compiled.viewJS).toContain("myOffer?id=");
        expect(compiled.viewJS).toContain("getSellerSaleEnrollment");
        expect(compiled.viewJS).toContain("submitSellerOfferPrice");
        expect(compiled.viewJS).toContain('workflowState !== "awaiting_seller_price"');
        expect(compiled.viewJS).toContain("majorToMinor");
        expect(compiled.viewJS).toContain("marketplaceTermsCurrentVersionAccepted");
        expect(compiled.viewJS).toContain('accountStatus === "active"');
        expect(compiled.viewJS).toContain('stripeAccountApiVersion === "v2"');
        expect(compiled.viewJS).toContain("applicationControlledRecipient === true");
        expect(compiled.viewJS).toContain('stripeTermsStatus === "accepted"');
        expect(compiled.viewJS).toContain("getConnectClientConfig");
        expect(compiled.viewJS).toContain('STRIPE_V2_API = "https://api.stripe.com/v2"');
        expect(compiled.viewJS).toContain("/core/account_tokens");
        expect(compiled.viewJS).toContain('"stripe-version": STRIPE_V2_VERSION');
        expect(compiled.viewJS).not.toContain("country: profile.countryCode.toLowerCase()");
        expect(compiled.viewJS).toContain('this.requestSource(this.accountSourceId, "updateAccount"');
        expect(compiled.viewJS).toContain("payload.accountToken");
        expect(compiled.viewJS).toContain("payload.sellerTermsAccepted = true");
        expect(compiled.viewJS).toContain('data-profile-control="givenName"');
        expect(compiled.viewJS).toContain('data-profile-control="birthDate"');
        expect(compiled.viewJS).toContain('data-profile-control="countryCode"');
        expect(compiled.viewJS).toContain('name="email" type="email" autocomplete="email" readonly required');
        expect(compiled.viewJS).toContain("profile.email = textValue(this.profile?.email)");
        expect(compiled.viewJS).toContain("control.hidden = profileFieldReady");
        expect(compiled.viewJS).toContain('href="/mon-espace/profil"');
        expect(compiled.viewJS).toContain('name="sellerTermsAccepted" type="checkbox"');
        expect(compiled.viewJS).toContain("this.stripeConsentFragment.hidden = !this.enrollmentRequired");
        expect(compiled.viewJS).toContain("if (!this.templateReady)");
        expect(compiled.viewJS).toContain("conditions vendeur Courtside");
        expect(compiled.viewJS).toContain("Les informations renseignées sont traitées");
        expect(compiled.viewJS).toContain("Consulter l’avis de confidentialité");
        expect(compiled.viewJS).toContain("Tu dois accepter les conditions vendeur Courtside et l’accord Stripe pour continuer.");
        expect(compiled.viewJS).toContain("Tu dois accepter les conditions vendeur Courtside pour continuer.");
        expect(compiled.viewJS).toContain("sessionStorage.setItem");
        expect(compiled.viewJS).not.toContain("history.pushState");
        expect(compiled.viewJS).not.toContain("submitMyOfferPrice?id=");
        expect(compiled.viewJS).not.toContain("eligibility-ensure-function-id");
        expect(compiled.viewJS).not.toContain("payoutEligible");
        expect(compiled.viewJS).not.toContain("canReceiveProtectedPayments");
        expect(compiled.viewJS).not.toContain("payoutsEnabled");
        expect(compiled.viewJS).not.toContain("verificationStatus");
        expect(compiled.viewJS).not.toContain("bankAccountToken");
        expect(compiled.viewJS).not.toContain("createBankAccountToken");
        expect(compiled.viewJS).not.toContain("contactEmail");
        expect(compiled.viewJS).not.toContain("l’accord Stripe et la politique de confidentialité");
        expect(compiled.viewJS).not.toContain("data-stripe-consent-fragment hidden");
        expect(compiled.viewJS.toLowerCase()).not.toContain("iban");
        expect(compiled.viewJS).not.toContain("synchronizeSellerPayoutEligibility");
        expect(compiled.viewJS).toContain("commerce-offer-price:submitted");
        expect(compiled.editorJS).toContain('attribute: "success-url"');
        expect(compiled.editorJS).toContain('attribute: "range-message"');
        expect(compiled.editorJS).toContain('attribute: "enrollment-function-id"');
        expect(compiled.editorJS).toContain('attribute: "stripe-source-id"');
        expect(compiled.editorJS).toContain('attribute: "seller-terms-url"');
        expect(compiled.editorJS).toContain('attribute: "privacy-url"');
        expect(compiled.editorJS).toContain('attribute: "privacy-notice"');
        expect(compiled.editorJS).toContain('attribute: "privacy-link-label"');
        expect(compiled.editorJS).toContain('attribute: "first-enrollment-consent-required-message"');
        expect(compiled.editorJS).toContain('attribute: "seller-terms-consent-required-message"');
        expect(compiled.editorJS).not.toContain('attribute: "privacy-label"');
        expect(compiled.editorJS).not.toContain('attribute: "consent-required-message"');
        expect(defaultContent).toContain('enrollment-function-id="getSellerSaleEnrollment"');
        expect(defaultContent).toContain('submit-function-id="submitSellerOfferPrice"');
        expect(defaultContent).toContain('seller-terms-url="/cgu-cgv"');
        expect(defaultContent).toContain('stripe-terms-url="https://stripe.com/connect-account/legal"');
        expect(defaultContent).toContain('privacy-url="/mentions-legales"');
        expect(defaultContent).toContain("Replace the privacy notice placeholder URL before production publication.");
        expect(manifest.meta.description).toContain("privacy information separately");
        expect(manifest.meta.description).toContain("placeholder");
        expect(await resolveUsage("<commerce-offer-price-form></commerce-offer-price-form>"))
            .toEqual([
                "basic-button", "basic-card", "basic-grid", "basic-input", "basic-skeleton",
                "basic-stack", "basic-toast", "commerce-offer-price-form",
            ]);

        const source = definition.artifacts?.find(item => item.type === "source");
        if (!source || source.type !== "source") throw new Error("commerce source not found");
        expect(source.source.endpoints.find(item => item.endpointId === "myOffer")?.access).toEqual({ mode: "auth" });
        expect(source.source.endpoints.find(item => item.endpointId === "submitMyOfferPrice")?.access).toEqual({ mode: "auth" });
    });
});
