import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { Component } from "@bernouy/components/base";
import { decodeDefaultContent } from "../source";

export function registerPaginationTest(): void {
    test("pagination emits stable page, limit, and offset details", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifacts = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

        for (const tag of ["basic-pagination"]) {
            if (customElements.get(tag)) {
                continue;
            }
            const artifact = artifacts.find((candidate) => candidate.bloc.tag === tag);
            if (!artifact || artifact.type !== "bloc") {
                throw new Error(`expected ${tag} artifact`);
            }
            const built = await prepare_bloc(
                new File([artifact.bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                artifact.bloc.editorJS
                    ? new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" })
                    : null,
                artifact.bloc.name,
                artifact.bloc.group ?? "",
                artifact.bloc.description ?? "",
                artifact.bloc.tag,
                artifact.bloc.source,
                decodeDefaultContent(artifact.bloc.source),
            );
            const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
            runtime.p9r ??= {};
            runtime.p9r.Component = Component;
            new Function(built.viewJS)();
        }

        const pagination = document.createElement("basic-pagination") as HTMLElement & {
            page: number;
            changePage(page: number): void;
        };
        pagination.setAttribute("page", "1");
        pagination.setAttribute("page-size", "12");
        pagination.setAttribute("total", "30");
        document.body.append(pagination);

        let detail: { page: number; limit: number; offset: number } | undefined;
        pagination.addEventListener("basic-pagination:change", (event) => {
            detail = (event as CustomEvent<typeof detail>).detail;
        });
        pagination.changePage(2);

        expect(pagination.page).toBe(2);
        expect(detail).toEqual({ page: 2, limit: 12, offset: 12 });
        expect(pagination.shadowRoot?.querySelector("[data-summary]")?.textContent).toBe("Page 2 sur 3");
        const previous = pagination.shadowRoot?.querySelector("[data-previous]");
        expect(previous?.getAttribute("tone")).toBe("primary");
        expect(previous?.getAttribute("appearance")).toBe("outlined");
        pagination.setAttribute("tone", "danger");
        pagination.setAttribute("appearance", "soft");
        expect(previous?.getAttribute("tone")).toBe("danger");
        expect(previous?.getAttribute("appearance")).toBe("soft");
        pagination.remove();
    });
}
