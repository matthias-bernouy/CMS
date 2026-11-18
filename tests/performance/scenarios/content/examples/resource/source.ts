import { resourceRuntimeNamespace } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../queries/types";

/** Plain authored documents keep their expected HTML independent of the reader implementation. */
export function exampleSources(collectionId: string, version: string, count = 64) {
    assertCondition(Number.isSafeInteger(count) && count >= 1 && count <= 64, "example-source-count");
    const tag = `${resourceRuntimeNamespace(collectionId)}--panel`;
    const files = Array.from({ length: count }, (_, index) => {
        const id = `example-${String(index).padStart(3, "0")}`;
        const start = `<div cms-bloc="${tag}"><p slot="body">Version ${version} example ${index}`;
        const end = "</p></div>";
        return [
            {
                path: `examples/${id}/definition.json`,
                content: JSON.stringify({
                    id,
                    label: "performance.example.label",
                    description: "performance.example.description",
                    previews: [{ id: "desktop", frame: { width: 640, height: 240 } }],
                }),
            },
            {
                path: `examples/${id}/document.html`,
                content: `${start}${index === 0 ? "x".repeat(64 * 1024 - start.length - end.length) : ""}${end}`,
            },
        ];
    }).flat();
    for (const locale of ["en", "fr"] as const) {
        files.push({
            path: `translations/${locale}/performance.json`,
            content: JSON.stringify({
                "performance.example.label":
                    locale === "en" ? `Performance example ${version}` : `Exemple de performance ${version}`,
                "performance.example.description":
                    locale === "en" ? `Controlled example ${version}` : `Exemple contrôlé ${version}`,
            }),
        });
    }
    return files;
}
