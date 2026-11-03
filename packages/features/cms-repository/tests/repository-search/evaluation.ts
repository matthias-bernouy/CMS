import { MemoryVectorStore } from "@bernouy/text-search";
import { TransformersEmbeddings } from "@bernouy/text-embeddings";
import { RepositorySearch } from "@bernouy/cms-repository/repository/search";
import { searchRow } from "../../src/repository/search/sources/rows";
import type { RepositorySearchRow } from "../../src/repository/search/interfaces";

const cacheDirectory = Bun.argv[2];
if (!cacheDirectory) {
    throw new Error("Usage: evaluation.ts <cached-model-directory>");
}
const digest = `sha256:${"a".repeat(64)}`;
const definitions = [
    [
        "storefront",
        "Product card",
        "Product card displaying merchandise photograph, title, price and purchase action",
        "bloc",
        "storefront-product",
    ],
    [
        "gallery",
        "Photo gallery",
        "Responsive image gallery with captions and full-screen photographs",
        "bloc",
        "gallery-grid",
    ],
    ["contact", "Contact form", "Contact form with name, email and message fields", "bloc", "contact-form"],
    [
        "example.catalogue",
        "Product catalogue",
        "Manage products, stock inventory, categories and merchandise prices",
        "contract",
        "",
    ],
    ["example.orders", "Order management", "Create customer orders, track payment and shipping status", "contract", ""],
    ["example.catalogue-service", "Catalogue service", "", "provider-manifest", ""],
] as const;
const rows: RepositorySearchRow[] = definitions.map(([id, name, description, kind, blocId]) =>
    searchRow(
        { kind: kind === "bloc" ? "collection" : kind, publisherId: "example.official", id, version: "1.0.0", digest },
        name,
        description,
        [],
        kind === "provider-manifest" ? ["example.catalogue"] : [],
        kind === "provider-manifest"
            ? "Product catalogue Manage products, stock inventory, categories and merchandise prices"
            : "",
        blocId || undefined,
    ),
);
const corpus = { load: async () => ({ revision: "evaluation", rows }) };
const model = new TransformersEmbeddings({ cacheDirectory, threads: 2, localFilesOnly: true });
let passages = 0;
let queries = 0;
const service = new RepositorySearch(
    corpus,
    {
        model: model.model,
        initialize: (signal) => model.initialize(signal),
        embed: (texts, kind, signal) => {
            if (kind === "passage") {
                passages += texts.length;
            } else {
                queries++;
            }
            return model.embed(texts, kind, signal);
        },
    },
    new MemoryVectorStore(),
);
const lexical = new RepositorySearch(corpus);
const questions = [
    ["carte produit avec prix", "storefront"],
    ["un formulaire pour nous envoyer un message", "contact"],
    ["afficher une grille de photos", "gallery"],
    ["gestion du stock et des produits", "example.catalogue"],
    ["suivre les commandes et livraisons", "example.orders"],
    ["product card with price", "storefront"],
    ["example.orders", "example.orders"],
] as const;
try {
    const started = performance.now();
    await service.prepare();
    const preparationMs = Math.round(performance.now() - started);
    const results = [];
    for (const [query, expected] of questions) {
        const before = performance.now();
        const simple = await lexical.search({ query, limit: 3 });
        const hybrid = await service.search({ query, limit: 3 });
        results.push({
            query,
            expected,
            lexical: simple.results.map((result) => result.reference.id),
            hybrid: hybrid.results.map((result) => result.reference.id),
            mode: hybrid.mode,
            ms: Math.round(performance.now() - before),
        });
    }
    console.log(
        JSON.stringify(
            {
                model: model.model,
                preparationMs,
                rows: rows.length,
                passages,
                queries,
                lexicalTop3: results.filter((result) => result.lexical.includes(result.expected)).length,
                hybridTop3: results.filter((result) => result.hybrid.includes(result.expected)).length,
                results,
            },
            null,
            2,
        ),
    );
} finally {
    await service.close();
    await lexical.close();
    await model.close();
}
