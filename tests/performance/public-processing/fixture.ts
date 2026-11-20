import type { RenderableBloc } from "@bernouy/content/rendering";

export const inventory: RenderableBloc[] = Array.from({ length: 200 }, (_, index) => ({
    id: `processing-card-${index}`,
    kind: "component",
    root: { accepts: ["div"] },
    markupHTML: "<article><slot></slot></article>",
    hasBehavior: false,
    uses: index < 19 ? [`processing-card-${index + 1}`] : [],
}));
export const views = Object.fromEntries(
    inventory.map((bloc, index) => [
        bloc.id,
        index < 19 ? `const view = '<div cms-bloc="processing-card-${index + 1}"></div>';` : "",
    ]),
);
export const usageHtml = '<div cms-bloc="processing-card-0"></div>';
export const expectedTags = inventory
    .slice(0, 20)
    .map(({ id }) => id)
    .sort();
export const textHtml = Array.from(
    { length: 1500 },
    (_, index) => `<p title="Public text ${index}">Public text ${index} &amp; content</p>`,
).join("");
export const pageHtml = Array.from(
    { length: 20 },
    (_, index) =>
        `<div cms-bloc="processing-card-${index}"><h2>Card ${index}</h2>${"<p>Public article &amp; content</p>".repeat(25)}</div>`,
).join("");
