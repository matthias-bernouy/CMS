import { expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

export function registerGridTest(): void {
    test("grid derives its tracks from minimum and maximum item widths", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-grid",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-grid artifact");
        }

        const bloc = artifact.bloc;
        const encodedStyles = bloc.source?.["style.css"];
        const styles = encodedStyles ? Buffer.from(encodedStyles, "base64").toString("utf8") : "";
        expect(styles).toContain("repeat(auto-fill, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).toContain("repeat(auto-fit, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).not.toContain(':host([max]:not([max="none"])) { --basic-grid-justify: center; }');
        expect(styles).toContain(':host([packing="fit"])');
        expect(styles).toContain(':host([min="lg"])');
        expect(styles).toContain(':host([max="xl"])');
        expect(bloc.editorJS).toContain('attribute: "packing"');
        expect(bloc.editorJS).not.toContain('attribute: "columns"');
    });
}
