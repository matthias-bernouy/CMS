import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { createBlocUsageResolver } from "@bernouy/cms-content";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Commerce schema-driven offer filter dependencies", () => {
    test("loads the Basic select runtime even when selects only appear dynamically", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("commerce");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "commerce-offer-filter",
        );
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
            throw new Error("commerce-offer-filter source not found");
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
            ["basic-option", "basic-select", "commerce-offer-filter"].map((id) => ({ id })),
            {
                getBlocViewJS: async (tag) => (tag === "commerce-offer-filter" ? compiled.viewJS : null),
            },
        );

        expect(await resolveUsage("<commerce-offer-filter></commerce-offer-filter>")).toEqual([
            "basic-option",
            "basic-select",
            "commerce-offer-filter",
        ]);
    });
});
