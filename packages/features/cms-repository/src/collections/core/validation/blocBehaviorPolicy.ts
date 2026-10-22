import { forbiddenBlocBehaviorIssues } from "@bernouy/cms-content/page-document";

export function validateForbiddenBlocBehavior(source: string, label: string): readonly string[] {
    return forbiddenBlocBehaviorIssues(source).map((issue) => `${label}: ${issue}.`);
}

export function validateCompiledBlocBehavior(source: string, label: string): readonly string[] {
    const errors = [...validateForbiddenBlocBehavior(source, label)];
    try {
        new Function(source);
    } catch (error) {
        errors.push(
            `${label}: invalid JavaScript (${error instanceof Error ? error.message : "unknown syntax error"}).`,
        );
    }
    return errors;
}
