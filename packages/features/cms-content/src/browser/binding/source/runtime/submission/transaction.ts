import { SOURCE_SERIALIZATION_ATTR } from "../../../core/attrs";
import type { FormSubmitResult } from "../../../submit/types";
import type { SourceSubmission } from "../../submission";
import { submissionReload } from "../refresh/registry";
import { lockEditing } from "./lock";

type Captured = NonNullable<ReturnType<SourceSubmission["capture"]>>;

/** One captured submission, its optional edit lock and its awaited read. */
export class SubmissionTransaction {
    private constructor(
        private readonly submission: SourceSubmission,
        private readonly captured: Captured,
        private readonly reload: ReturnType<typeof submissionReload>,
        private unlock: (() => void) | null,
    ) {}

    static prepare(element: Element, submission: SourceSubmission, url: string): SubmissionTransaction | null {
        const reload = submissionReload(element as HTMLFormElement);
        const captured = submission.capture(url);
        if (!captured) {
            return null;
        }
        const needsLock = reload || element.getAttribute(SOURCE_SERIALIZATION_ATTR) === "typed-json";
        const unlock = needsLock ? lockEditing(reload?.source ?? element, captured.form) : null;
        if (needsLock && !unlock) {
            return null;
        }
        return new SubmissionTransaction(submission, captured, reload, unlock);
    }

    get locked(): boolean {
        return this.unlock !== null;
    }

    async send(url: string, signal: AbortSignal): Promise<FormSubmitResult | null> {
        const result = await this.submission.send(this.captured, url, signal);
        if (signal.aborted || (this.reload && !this.reload.current())) {
            return null;
        }
        if (result.ok && this.reload) {
            const ok = await this.reload.reload();
            if (signal.aborted || !this.reload.current()) {
                return null;
            }
            result.refresh = {
                ok,
                message: ok ? "" : "Saved, but refreshing the data failed. Reload the source without submitting again.",
            };
        }
        return result;
    }

    release(): void {
        const unlock = this.unlock;
        this.unlock = null;
        unlock?.();
    }
}
