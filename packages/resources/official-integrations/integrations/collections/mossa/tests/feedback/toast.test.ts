import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("Mossa toast", () => {
    test("waits until a conditional toast is visible and preserves it for reuse", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("mossa");
        const artifact = definition?.artifacts?.find((item) => item.type === "bloc" && item.bloc.tag === "mossa-toast");
        if (!artifact || artifact.type !== "bloc" || !artifact.bloc.viewJS) {
            throw new Error("mossa-toast source not found");
        }
        const compiled = await prepare_bloc(
            new File([artifact.bloc.viewJS], "Bloc.ts", { type: "text/typescript" }),
            null,
            artifact.bloc.name,
            artifact.bloc.group ?? "Feedback",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
        );
        const previousP9r = (window as typeof window & { p9r?: unknown }).p9r;
        (window as typeof window & { p9r?: unknown }).p9r = { Component };
        try {
            if (!customElements.get("mossa-toast")) {
                new Function(compiled.viewJS)();
            }
            const toast = document.createElement("mossa-toast");
            toast.setAttribute("cms-condition", "$sources.save.loaded");
            toast.setAttribute("duration", "5");
            toast.hidden = true;
            document.body.append(toast);

            await Bun.sleep(220);
            expect(toast.isConnected).toBe(true);
            expect(toast.hidden).toBe(true);

            const dismissed = new Promise<void>((resolve) => {
                toast.addEventListener("mossa-toast:dismissed", () => resolve(), { once: true });
            });
            toast.hidden = false;
            await dismissed;
            expect(toast.isConnected).toBe(true);
            expect(toast.hidden).toBe(true);
            expect(toast.hasAttribute("leaving")).toBe(false);

            toast.hidden = false;
            toast.setAttribute("duration", "0");
            await Bun.sleep(20);
            expect(toast.isConnected).toBe(true);
            expect(toast.hidden).toBe(false);
        } finally {
            document.body.replaceChildren();
            (window as typeof window & { p9r?: unknown }).p9r = previousP9r;
        }
    });
});
