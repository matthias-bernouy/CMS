type RiskArea = { label: string; matches(path: string): boolean; question: string };
const areas: readonly RiskArea[] = [
    {
        label: "HTTP boundary",
        matches: (p) => /\/http\/|\/surfaces\/|Resource|\/handle/.test(p),
        question: "Bounded inputs, actor access and instance isolation? Refusals leave business state unchanged?",
    },
    {
        label: "Persistence",
        matches: (p) => /\/mongo\/|Mongo[^/]*\.ts$/.test(p),
        question: "Read/write count, pagination, loaded bytes, awaited loops and index cost?",
    },
    {
        label: "Authority",
        matches: (p) => /\/(?:cms-gateway|access|authority|authentication|protocol)\//.test(p),
        question: "Instance isolation, fresh checks, delegation, token claims and quota cost per request?",
    },
    {
        label: "Cache",
        matches: (p) => /cache/i.test(p),
        question: "Complete key, byte/entry/concurrency bounds, invalidation and failures?",
    },
    {
        label: "Contracts",
        matches: (p) => p.startsWith("packages/official-repository/contracts/"),
        question: "Version, access levels and cost on each invocation?",
    },
    {
        label: "Browser and collections",
        matches: (p) => /\/browser\/|official-repository\/collections\//.test(p),
        question: "JavaScript trust, network calls and bundle size?",
    },
];
export function reviewBlock(paths: readonly string[]): string[] {
    if (!paths.length) {
        return ["Review: no changed files detected; automated checks do not prove security or performance."];
    }
    if (paths.every((p) => /\.(?:md|txt)$/.test(p))) {
        return ["Review: documentation only; check accuracy and local links."];
    }
    const lines = [
        `Review before handoff (${paths.length} changed files): automated checks are not a security or performance review.`,
        "Does changed code run per request? How many times, against which limit or quota? Include affected callers of shared code.",
        "Review relevant access controls, instance isolation, sensitive data and business side effects even when no path-specific reminder matches.",
    ];
    for (const area of areas) {
        const matches = paths.filter(area.matches);
        if (matches.length) {
            lines.push(`${area.label} (${matches.length} files): ${area.question}`);
        }
    }
    lines.push(
        "Evidence: relevant test path/name or before/after measurement; explain omissions and remaining limits.",
    );
    return lines;
}
