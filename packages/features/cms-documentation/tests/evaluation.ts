import { dirname, resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";

// Explicit opt-in evaluation: downloads the pinned model if it is absent from the supplied cache.
const root = resolve(Bun.argv[2] ?? "packages/runtimes/ulvia-cli/dist/bootstrap");
const cacheDirectory = Bun.argv[3];
const offline = Bun.argv.includes("--offline");
if (offline) {
    globalThis.fetch = new Proxy(globalThis.fetch, {
        apply() {
            throw new Error("Network fetch is disabled for offline documentation evaluation");
        },
    });
}
if (!cacheDirectory) {
    throw new Error("Usage: evaluate <bootstrap-directory> <model-cache-directory>");
}
const index = await Bun.file(resolve(root, "index.json")).json();
const paths = new Map<string, string>();
const releases = await Promise.all(
    (index.contracts as string[]).map(async (path) => {
        const admission = await admitContractReleaseJson(await Bun.file(resolve(root, path)).text());
        paths.set(admission.digest, dirname(resolve(root, path)));
        return admission;
    }),
);
let reads = 0;
let embeddings = 0;
const model = new TransformersEmbeddings({ cacheDirectory, threads: 2, localFilesOnly: offline });
const service = new CmsDocumentation(
    {
        resolve: async () => ({ revision: "evaluation", releases }),
        isCurrent: async () => true,
        read: async (reference) => {
            reads++;
            return Bun.file(resolve(paths.get(reference.releaseDigest)!, "docs", reference.path));
        },
    },
    {
        model: model.model,
        embed: (...args) => {
            embeddings++;
            return model.embed(...args);
        },
    },
);
const questions = [
    ["How do I avoid overwriting somebody else's page changes?", "pages/revisions.md"],
    ["Comment modifier une page sans écraser les changements des autres ?", "pages/revisions.md"],
    ["¿Cómo editar una página sin sobrescribir cambios de otras personas?", "pages/revisions.md"],
    ["如何修改页面而不覆盖其他人的更改？", "pages/revisions.md"],
    ["Quelles vérifications faire avant de publier une page ?", "pages/verify.md"],
    ["How do I upload a local image?", "site-files.md"],
    ["¿Cómo subir un archivo desde mi ordenador?", "site-files.md"],
    ["如何上传本地文件？", "site-files.md"],
    ["Comment préparer, vérifier puis publier une collection ?", "collection-authoring.md"],
    ["How do I read the full documentation after a search?", "documentation.md"],
    ["I am starting from nothing. What exact files make a minimal reusable panel collection?", "collection-source.md"],
    [
        "Je veux créer mon premier composant réutilisable : quels fichiers et quel format envoyer ?",
        "collection-source.md",
    ],
    ["¿Cuál es el formato de archivos para crear una colección mínima con un panel?", "collection-source.md"],
    ["创建一个最小的可复用组件集合需要哪些文件？", "collection-source.md"],
    ["Which HTTP request sends the file bytes after I obtain an upload session?", "site-files.md"],
    ["A colleague changed the heading while I edited the description. How do I keep their work?", "pages/revisions.md"],
    ["How do I check whether an accepted collection upgrade operation actually finished?", "collection-authoring.md"],
];
await service.prepare();
const results = [];
for (const [query, expected] of questions) {
    const started = performance.now();
    const before = { reads, embeddings };
    const result = await service.search({ query, limit: 3 });
    const paths = result.results.map((row) => row.reference.path);
    results.push({
        query,
        expected,
        paths,
        found: paths.includes(expected!),
        mode: result.mode,
        ms: Math.round(performance.now() - started),
        reads: reads - before.reads,
        embeddings: embeddings - before.embeddings,
    });
}
console.log(
    JSON.stringify(
        {
            model: model.model,
            offline,
            relevantInTop3: results.filter((result) => result.found).length,
            originalRelevantInTop3: results.slice(0, 10).filter((result) => result.found).length,
            additionalRelevantInTop3: results.slice(10).filter((result) => result.found).length,
            total: results.length,
            results,
        },
        null,
        2,
    ),
);
await service.close();
await model.close();
if (results.some((result) => result.mode !== "hybrid") || results.some((result) => !result.found)) {
    process.exitCode = 1;
}
