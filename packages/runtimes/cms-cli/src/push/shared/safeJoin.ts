import { resolve, sep } from "node:path";

/**
 * Join untrusted path segments onto a trusted base directory and guarantee the
 * result stays inside that base. `p9r pull` writes files whose on-disk location
 * is derived from server-controlled values (bloc tags, page paths,
 * template identifiers, bundle file names); without containment a
 * crafted value like `../../../home/user/.bashrc` would let a malicious or
 * compromised server write arbitrary files outside `siteDir`. Throws when a
 * segment escapes `base`, so the caller surfaces a per-entity error.
 */
export function safeJoin(base: string, ...segments: string[]): string {
    const baseResolved = resolve(base);
    const full = resolve(baseResolved, ...segments);
    if (full !== baseResolved && !full.startsWith(baseResolved + sep)) {
        throw new Error(`refusing to write outside "${base}": "${segments.join("/")}" escapes the site directory`);
    }
    return full;
}
