import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Commerce schema-driven offer filter dependencies", () => {
    test("loads the Mossa select runtime even when selects only appear dynamically", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-commerce-offer-filter",
        );
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
            throw new Error("mossa-commerce-offer-filter source not found");
        }
        const compiled = await prepare_bloc(
            new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            artifact.bloc.name,
            artifact.bloc.group ?? "Commerce",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
        );
        const resolveUsage = createBlocUsageResolver(
            ["mossa-option", "mossa-select", "mossa-commerce-offer-filter"].map((id) => ({ id })),
            {
                getBlocViewJS: async (tag) => (tag === "mossa-commerce-offer-filter" ? compiled.viewJS : null),
            },
        );

        expect(await resolveUsage("<mossa-commerce-offer-filter></mossa-commerce-offer-filter>")).toEqual([
            "mossa-commerce-offer-filter",
            "mossa-option",
            "mossa-select",
        ]);
    });
});
