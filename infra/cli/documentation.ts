import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const CLI_DOCUMENTATION = [
    { source: "packages/runtimes/ulvia-cli/README.md", target: "README.md" },
    { source: "docs/installation/README.md", target: "INSTALLATION.md" },
    { source: "docs/architecture/shared-hosting.md", target: "SHARED-HOSTING.md" },
] as const;

/** Keep shipped guides local; pin other source documentation links to the build revision. */
export async function writeCliDocumentation(root: string, staging: string, revision: string): Promise<void> {
    const targets = new Map(CLI_DOCUMENTATION.map(({ source, target }) => [resolve(root, source), target]));
    await Promise.all(
        CLI_DOCUMENTATION.map(async ({ source, target }) => {
            const input = resolve(root, source);
            const content = await readFile(input, "utf8");
            const rewritten = content.replace(/(\[[^\]]+\]\()([^\s)]+)(\))/gu, (match, prefix, href, suffix) => {
                if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/iu.test(href)) {
                    return match;
                }
                const [pathname, anchor] = href.split("#");
                const destination = resolve(dirname(input), pathname);
                const local = targets.get(destination);
                const path = relative(root, destination).split(sep).join("/");
                const url = local ?? `https://github.com/matthias-bernouy/CMS/blob/${revision}/${path}`;
                return `${prefix}${url}${anchor ? `#${anchor}` : ""}${suffix}`;
            });
            await writeFile(join(staging, target), rewritten);
        }),
    );
}
