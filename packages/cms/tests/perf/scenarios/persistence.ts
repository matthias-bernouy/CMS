import { type BrowserScenario } from "./types";

async function _pageSaveRoundtrip() {
    const main = document.querySelector("main")!;
    const now = () => performance.now();
    main.querySelectorAll(".__perf_save__").forEach(el => el.remove());
    const grid = document.createElement("div");
    grid.className = "__perf_save__";
    for (let i = 0; i < 200; i++) {
        const p = document.createElement("p");
        p.textContent = "save " + i;
        grid.appendChild(p);
    }
    main.appendChild(grid);
    await new Promise(r => setTimeout(r, 400));

    const em = document.EditorManager;
    if (!em) throw new Error("EditorManager not on document");
    const tSer = now();
    const content = em.getContent();
    const serializeMs = now() - tSer;
    const editorModeBytes = main.innerHTML.length;

    const urlParams = new URLSearchParams(window.location.search);
    const path = urlParams.get("path") || "/perf-test";
    const identifier = urlParams.get("identifier") || "perf-test";

    const body = { content, path, identifier, title: "Perf Test", description: "", visible: true, tags: "" };
    const target = "/cms/api/page?path=" + encodeURIComponent(path) + "&identifier=" + encodeURIComponent(identifier);

    const samples: number[] = [];
    const payloadBytes = JSON.stringify(body).length;
    for (let i = 0; i < 5; i++) {
        const t = now();
        const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
        if (!res.ok) throw new Error("save failed: " + res.status + " " + await res.text());
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    return {
        pageSaveMedianMs: +samples[Math.floor(samples.length / 2)]!.toFixed(1),
        pageSaveP95Ms: +samples[Math.floor(samples.length * 0.95)]!.toFixed(1),
        pageSaveMaxMs: +samples[samples.length - 1]!.toFixed(1),
        pageSaveSerializeMs: +serializeMs.toFixed(2),
        pageSavePayloadBytes: payloadBytes,
        pageSaveContentBytes: content.length,
        pageSaveEditorModeBytes: editorModeBytes,
    };
}

async function _templateSaveRoundtrip() {
    const now = () => performance.now();
    const cells: string[] = [];
    for (let i = 0; i < 200; i++) cells.push("<div><p>template cell " + i + "</p></div>");
    const content = '<div class="grid">' + cells.join("") + "</div>";
    const payload = JSON.stringify({ name: "perf-tpl", description: "", content, category: "perf" });
    const payloadBytes = payload.length;

    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
        const t = now();
        const res = await fetch("/cms/api/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, credentials: "include" });
        if (!res.ok) throw new Error("template save failed: " + res.status);
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    return {
        templateSaveMedianMs: +samples[Math.floor(samples.length / 2)]!.toFixed(1),
        templateSaveP95Ms: +samples[Math.floor(samples.length * 0.95)]!.toFixed(1),
        templateSaveMaxMs: +samples[samples.length - 1]!.toFixed(1),
        templateSavePayloadBytes: payloadBytes,
    };
}

export const pageSaveRoundtrip: BrowserScenario = {
    name: "page-save-roundtrip",
    absolutes: { pageSaveMedianMs: 200, pageSaveP95Ms: 500, pageSaveSerializeMs: 50 },
    run: _pageSaveRoundtrip.toString(),
};

export const templateSaveRoundtrip: BrowserScenario = {
    name: "template-save-roundtrip",
    absolutes: { templateSaveMedianMs: 200, templateSaveP95Ms: 500 },
    run: _templateSaveRoundtrip.toString(),
};
