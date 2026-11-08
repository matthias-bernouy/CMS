import { forbiddenStyleWriteIssues } from "./styleWrites";

const LOCATION_MUTATIONS: readonly [name: string, pattern: RegExp][] = [
    ["location.href = …", /\blocation\s*\.\s*href\s*=/u],
    ["window.location.href = …", /\bwindow\s*\.\s*location\s*\.\s*href\s*=/u],
    ["location.assign(…)", /\blocation\s*\.\s*assign\s*\(/u],
    ["location.replace(…)", /\blocation\s*\.\s*replace\s*\(/u],
    ["window.location = …", /\bwindow\s*\.\s*location\s*=(?!=)/u],
];

/** Shared static policy for site-authored and collection-authored Bloc behavior. */
export function forbiddenBlocBehaviorIssues(source: string): readonly string[] {
    const issues: string[] = [...forbiddenStyleWriteIssues(source)];
    if (/(?:\bwindow\s*\.\s*)?\bcustomElements\s*\.\s*define\s*\(/u.test(source)) {
        issues.push("customElements.define is forbidden; export mount(root) instead");
    }
    if (/\battachShadow\s*\(|\.\s*shadowRoot\b/u.test(source)) {
        issues.push("Shadow DOM APIs are forbidden; mount behavior on the native cms-bloc root");
    }
    if (
        /\bcreateElementNS\s*\(\s*["'`]http:\/\/www\.w3\.org\/2000\/svg["'`]/u.test(source) ||
        /\bcreateElement\s*\(\s*["'`]svg["'`]/u.test(source) ||
        /<svg(?:\s|>)/iu.test(source)
    ) {
        issues.push("programmatic SVG markup is forbidden; declare an admitted cms-svg asset");
    }
    if (/\bcreateElement\s*\(\s*["'`]iframe["'`]/iu.test(source) || /<iframe(?:\s|>)/iu.test(source)) {
        issues.push("programmatic iframe creation is forbidden; declare iframe markup and browser capabilities");
    }
    for (const [name, pattern] of LOCATION_MUTATIONS) {
        if (pattern.test(source)) {
            issues.push(`${name} is forbidden; use declarative navigation`);
        }
    }
    return issues;
}
