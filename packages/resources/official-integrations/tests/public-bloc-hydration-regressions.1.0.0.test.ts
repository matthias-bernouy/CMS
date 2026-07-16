import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("public bloc hydration regressions 1.0.0", () => {
    test("defers offer-price attribute reactions until its composition template exists", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        const artifact = definition?.artifacts?.find(item => item.type === "bloc" && item.bloc.tag === "commerce-offer-price-form");
        const viewJS = artifact?.type === "bloc" ? artifact.bloc.viewJS ?? "" : "";

        expect(viewJS).toContain("if (!this.templateReady) return;");
        expect(viewJS).toContain("get templateReady() { return Boolean(this.loading && this.card && this.unavailable && this.technical && this.success && this.form); }");
    });

    test("keeps a hidden toast out of layout even when its host styles set display", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("basic-blocs");
        const artifact = definition?.artifacts?.find(item => item.type === "bloc" && item.bloc.tag === "basic-toast");
        const encoded = artifact?.type === "bloc" ? artifact.bloc.source?.["style.css"] : undefined;
        const css = encoded ? Buffer.from(encoded, "base64").toString("utf-8") : "";

        expect(css).toContain(":host([hidden])");
        expect(css).toContain("display: none !important;");
    });
});
