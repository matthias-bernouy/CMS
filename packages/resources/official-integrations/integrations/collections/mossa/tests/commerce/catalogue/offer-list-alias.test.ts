import { afterEach, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

const listTag = "test-commerce-offer-list-alias";

afterEach(() => {
    document.querySelectorAll(listTag).forEach((element) => element.remove());
});

describe("Commerce offer list installation aliases", () => {
    test("keeps pagination scoped to the nearest aliased list", async () => {
        await defineList();
        const list = document.createElement(listTag);
        list.setAttribute("sync-url", "false");
        const pagination = document.createElement("mossa-pagination");
        list.append(pagination);
        document.body.append(list);

        pagination.dispatchEvent(
            new CustomEvent("mossa-pagination:change", {
                bubbles: true,
                detail: { page: 2 },
            }),
        );

        expect(list.getAttribute("cms-source")).toContain("offset=12");

        const nestedList = document.createElement("section");
        nestedList.setAttribute("data-commerce-offer-list", "");
        const nestedPagination = document.createElement("mossa-pagination");
        nestedList.append(nestedPagination);
        list.append(nestedList);
        nestedPagination.dispatchEvent(
            new CustomEvent("mossa-pagination:change", {
                bubbles: true,
                detail: { page: 3 },
            }),
        );
        expect(list.getAttribute("cms-source")).toContain("offset=12");
    });
});

async function defineList(): Promise<void> {
    if (customElements.get(listTag)) {
        return;
    }
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
    const artifact = definition?.artifacts?.find(
        (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "mossa-commerce-offer-list",
    );
    if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
        throw new Error("mossa-commerce-offer-list source not found");
    }
    const compiled = await prepare_bloc(
        new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
        null,
        artifact.bloc.name,
        artifact.bloc.group ?? "Commerce",
        artifact.bloc.description ?? "",
        listTag,
        artifact.bloc.source,
    );
    new Function(compiled.viewJS)();
}
