import {
    requestRepositoryReevaluation,
    requestRepositoryStablePromotion,
    requestRepositoryVersionBlock,
    submitRepositoryCandidate as submitCandidate,
} from "../api";
import type { RepositoryCandidateView } from "../contracts/candidates";
import type { RepositoryVersionSelection } from "../contracts/types";
import { readRepositoryVersionBlock } from "../forms/block";
import { readRepositoryCandidateFile } from "../forms/candidate";
import { readRepositoryPromotion } from "../forms/promotion";
import { readRepositoryReevaluation } from "../forms/reevaluation";
import { clearFeedback, showFeedback, showRepositoryError } from "../render/feedback";

export type RepositoryActionContext = Readonly<{
    signal: AbortSignal;
    selection: () => RepositoryVersionSelection | undefined;
    updateSelection: (selection: RepositoryVersionSelection) => void;
    reloadKind: (kind: string) => Promise<void>;
    reloadCompatibility: () => Promise<void>;
    monitorCandidate: (candidate: RepositoryCandidateView) => void;
}>;

export async function submitRepositoryCandidate(
    form: HTMLFormElement,
    feedback: HTMLElement,
    context: RepositoryActionContext,
): Promise<void> {
    await withBusy(form, feedback, async () => {
        const candidate = await submitCandidate(await readRepositoryCandidateFile(form), context.signal);
        showFeedback(
            feedback,
            `Candidate ${candidate.candidateId} accepted for ${candidate.kind}@${candidate.version}; verification is ${candidate.status}.`,
            "success",
        );
        form.reset();
        context.monitorCandidate(candidate);
    });
}

export async function submitRepositoryVersionBlock(
    form: HTMLFormElement,
    feedback: HTMLElement,
    context: RepositoryActionContext,
): Promise<void> {
    await withSelection(form, feedback, context, async (selection) => {
        const result = await requestRepositoryVersionBlock(readRepositoryVersionBlock(form, selection), context.signal);
        showFeedback(
            feedback,
            `Blocked ${result.kind}@${result.version}. Channels repaired to stable ${result.nextChannels.stable ?? "unset"}, latest ${result.nextChannels.latest ?? "unset"}.`,
            "success",
        );
        form.reset();
        await context.reloadKind(result.kind);
        await context.reloadCompatibility();
    });
}

export async function submitRepositoryReevaluation(
    form: HTMLFormElement,
    feedback: HTMLElement,
    context: RepositoryActionContext,
): Promise<void> {
    await withSelection(form, feedback, context, async (selection) => {
        const result = await requestRepositoryReevaluation(readRepositoryReevaluation(form, selection), context.signal);
        context.updateSelection({ ...selection, currentReportRevisionId: result.currentReportRevisionId });
        showFeedback(
            feedback,
            `Created compatibility revision ${result.currentReportRevisionId}: ${result.revision.outcome}.`,
            "success",
        );
        form.reset();
        await context.reloadCompatibility();
    });
}

export async function submitRepositoryPromotion(
    form: HTMLFormElement,
    feedback: HTMLElement,
    context: RepositoryActionContext,
): Promise<void> {
    await withSelection(form, feedback, context, async (selection) => {
        const result = await requestRepositoryStablePromotion(readRepositoryPromotion(form, selection), context.signal);
        showFeedback(
            feedback,
            `Promoted ${result.kind}@${result.version} to stable using report ${result.reportRevisionId}.`,
            "success",
        );
        form.reset();
        await context.reloadKind(result.kind);
    });
}

async function withSelection(
    form: HTMLFormElement,
    feedback: HTMLElement,
    context: RepositoryActionContext,
    operation: (selection: RepositoryVersionSelection) => Promise<void>,
): Promise<void> {
    await withBusy(form, feedback, async () => {
        const selection = context.selection();
        if (!selection) {
            throw new Error("Repository version selection is unavailable");
        }
        await operation(selection);
    });
}

async function withBusy(form: HTMLFormElement, feedback: HTMLElement, operation: () => Promise<void>): Promise<void> {
    clearFeedback(feedback);
    const controls = Array.from(form.querySelectorAll<HTMLButtonElement>("button"));
    controls.forEach((control) => {
        control.disabled = true;
    });
    form.setAttribute("aria-busy", "true");
    try {
        await operation();
    } catch (error) {
        if (!isAbortError(error)) {
            showRepositoryError(feedback, error);
        }
    } finally {
        form.removeAttribute("aria-busy");
        controls.forEach((control) => {
            control.disabled = false;
        });
    }
}

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
