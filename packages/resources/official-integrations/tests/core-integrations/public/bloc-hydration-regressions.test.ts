import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("public bloc hydration regressions 1.0.0", () => {
    test("defers offer-price attribute reactions until its composition template exists", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("ulvia");
        const artifact = definition?.artifacts?.find(
            (item) => item.type === "bloc" && item.bloc.tag === "commerce-offer-price-form-controller",
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

    test("keeps a hidden toast out of layout even when its host styles set display", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("ulvia");
        const artifact = definition?.artifacts?.find((item) => item.type === "bloc" && item.bloc.tag === "basic-toast");
        const encoded = artifact?.type === "bloc" ? artifact.bloc.source?.["style.css"] : undefined;
        const css = encoded ? Buffer.from(encoded, "base64").toString("utf-8") : "";

        expect(css).toContain(":host([hidden])");
        expect(css).toContain("display: none !important;");
    });

    test("keeps a hidden card out of layout even when its host styles set display", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("ulvia");
        const artifact = definition?.artifacts?.find((item) => item.type === "bloc" && item.bloc.tag === "basic-card");
        const viewJS = artifact?.type === "bloc" ? (artifact.bloc.viewJS ?? "") : "";

        expect(viewJS).toContain(":host([hidden])");
        expect(viewJS).toContain("display: none !important;");
    });
});
