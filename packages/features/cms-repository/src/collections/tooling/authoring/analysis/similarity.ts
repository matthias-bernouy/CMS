import type { ContentDiagnostic } from "@bernouy/cms-content/page-document";
import type { blocDesignFingerprint } from "./fingerprint";

type Descriptor = NonNullable<ReturnType<typeof blocDesignFingerprint>>;

/** Compare only equal DOM/contracts and CSS selector/media/order skeletons, never arbitrary attribute bags. */
export function nearBlocDiagnostics(descriptors: readonly Descriptor[]): ContentDiagnostic[] {
    const unique = [...new Map(descriptors.map((descriptor) => [descriptor.fingerprint, descriptor])).values()];
    const groups = new Map<string, Descriptor[]>();
    for (const descriptor of unique) {
        groups.set(descriptor.structure, [...(groups.get(descriptor.structure) ?? []), descriptor]);
    }
    const diagnostics: ContentDiagnostic[] = [];
    let compared = 0;
    for (const group of groups.values()) {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                compared++;
                if (compared > 4096 || diagnostics.length >= 16) {
                    return [
                        ...diagnostics.slice(0, 15),
                        {
                            code: "analysis.truncated",
                            severity: "warning",
                            message:
                                "The bounded similarity review is incomplete; additional candidates were not compared.",
                        },
                    ];
                }
                const a = group[i]!,
                    b = group[j]!;
                if (cosine(a.features, b.features) >= 0.98) {
                    diagnostics.push({
                        code: "design.near_blocs",
                        severity: "warning",
                        message:
                            "These Blocs share normalized DOM, native/slot contracts and CSS selector/media structure, with very similar CSS values. Review the remaining style and cascade differences; intentional variants may remain separate.",
                        relatedResources: [a.id, b.id],
                        suggestion:
                            "Consider a shared structure with explicit variants only if it preserves each Bloc's meaning and public contract.",
                    });
                }
            }
        }
    }
    return diagnostics;
}

function cosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
    let dot = 0,
        aa = 0,
        bb = 0;
    for (const [key, value] of a) {
        dot += value * (b.get(key) ?? 0);
        aa += value * value;
    }
    for (const value of b.values()) {
        bb += value * value;
    }
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
