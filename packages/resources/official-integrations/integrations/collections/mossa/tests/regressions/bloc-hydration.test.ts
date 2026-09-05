import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Mossa bloc hydration regressions", () => {
    test("defers offer-price attribute reactions until its composition template exists", async () => {
        const definition = await mossa();
        const artifact = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-commerce-offer-price-form-controller",
        );
        const viewJS = artifact?.type === "bloc" ? (artifact.bloc.viewJS ?? "") : "";
        const compactViewJS = viewJS.replace(/\s+/g, "");
        const callbackStart = compactViewJS.indexOf("attributeChangedCallback(name){");
        const callbackEnd = compactViewJS.indexOf("asyncload(){", callbackStart);

        expect(callbackStart).toBeGreaterThanOrEqual(0);
        expect(callbackEnd).toBeGreaterThan(callbackStart);

        const callbackSource = compactViewJS.slice(callbackStart, callbackEnd);
        const templateGuard = callbackSource.indexOf("if(!this.templateReady){return;}");
        expect(templateGuard).toBeGreaterThanOrEqual(0);
        for (const reaction of ["this.syncPresentation();", "this.renderOffer();", "this.load();"]) {
            expect(callbackSource.indexOf(reaction)).toBeGreaterThan(templateGuard);
        }
        expect(compactViewJS).toContain(
            "gettemplateReady(){returnBoolean(this.loading&&this.card&&this.unavailable&&this.technical&&this.success&&this.form);}",
        );
    });

    test("keeps hidden hosts out of layout when their regular styles set display", async () => {
        const definition = await mossa();
        const toast = definition.artifacts?.find((item) => item.type === "bloc" && item.bloc.tag === "mossa-toast");
        const card = definition.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "mossa-surface-card",
        );
        const toastCss =
            toast?.type === "bloc" && toast.bloc.source?.["style.css"]
                ? Buffer.from(toast.bloc.source["style.css"], "base64").toString("utf8")
                : "";
        const cardSource = card?.type === "bloc" ? (card.bloc.viewJS ?? "") : "";

        for (const source of [toastCss, cardSource]) {
            expect(source).toContain(":host([hidden])");
            expect(source).toContain("display: none !important;");
        }
    });
});

async function mossa() {
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    if (!definition) {
        throw new Error("Mossa definition not found");
    }
    return definition;
}
