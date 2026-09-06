import { expect, test } from "bun:test";
import { installArticleProse } from "../../blocs/foundation/content/editorial/article/prose";

test("article prose shares scoped link styles without changing authored content", () => {
    const article = document.createElement("mossa-article");
    const duplicate = document.createElement("mossa-article");
    article.innerHTML = '<h2>Terms</h2><section><p>Read <a href="/terms">these terms</a>.</p></section>';
    const original = article.innerHTML;
    document.body.append(article, duplicate);
    const owner = document.createElement("div");
    document.body.append(owner);
    const shadow = owner.attachShadow({ mode: "open" });
    const nested = document.createElement("mossa-article");
    nested.innerHTML = article.innerHTML;
    shadow.append(nested);
    try {
        installArticleProse(article);
        installArticleProse(duplicate);
        installArticleProse(nested);
        expect(document.querySelectorAll("style[data-mossa-article-prose]")).toHaveLength(1);
        expect(shadow.querySelectorAll("style[data-mossa-article-prose]")).toHaveLength(1);
        expect(article.innerHTML).toBe(original);
        expect(nested.innerHTML).toBe(original);
        const style = document.querySelector("style[data-mossa-article-prose]");
        expect(style?.textContent).toContain("mossa-article :where(a[href])");
        expect(style?.textContent).toContain("var(--ulvia-secondary-base)");
        expect(style?.textContent).toContain(":focus-visible");
    } finally {
        article.remove();
        duplicate.remove();
        owner.remove();
        document.querySelector("style[data-mossa-article-prose]")?.remove();
    }
});
