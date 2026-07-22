import "cms-control/components/admin/Layout/ShellDetail/ShellDetail";
import {
    currentFunctionId,
    executeFunctionDetail,
    fetchFunctionDetail,
    type FunctionDetail,
    type FunctionExecutionResult,
} from "../api";
import { backLink, state, styleNode, title } from "../dom";
import { initialDraft, readFallbackDraft, readPathDraft, stringify } from "../create/draft";
import { hydrateExecuteFields, seedDependents } from "../create/fields";
import { readableResult } from "../result";
import type { FunctionDraft } from "../types";
import css from "./style.css" with { type: "text" };
import { contractSection, functionSummarySection, headerActions, inputsSection, resultSection } from "./view";
export class CmsFunctionDetail extends HTMLElement {
    private initialized = false;
    private detail: FunctionDetail | null = null;
    private draft: FunctionDraft = { params: {}, body: {} };
    private runButton: HTMLButtonElement | null = null;
    private resultStatus: HTMLElement | null = null;
    private resultMessage: HTMLElement | null = null;
    private resultBody: HTMLPreElement | null = null;
    connectedCallback(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        void this.load();
    }
    private async load(): Promise<void> {
        const id = currentFunctionId();
        if (!id) {
            return this.renderState("Missing function id.");
        }
        this.renderState("Loading function...");
        try {
            this.detail = await fetchFunctionDetail(id);
            this.resetDraft();
            this.renderDetail();
        } catch (error) {
            this.renderState(error instanceof Error ? error.message : "Failed to load function.");
        }
    }
    private resetDraft(): void {
        if (this.detail) {
            this.draft = initialDraft(this.detail.paramsSample, this.detail.bodySample ?? {});
        }
    }
    private renderState(message: string): void {
        this.replaceChildren(styleNode(css as unknown as string), state(message));
    }
    private renderDetail(): void {
        if (!this.detail) {
            return;
        }
        const shell = document.createElement("cms-shell-detail");
        shell.className = "functions-shell";
        shell.append(
            backLink(),
            title(this.detail),
            headerActions(),
            inputsSection(this.detail, this.draft, (path) => void this.onInputChange(path)),
            resultSection(),
            functionSummarySection(this.detail),
            contractSection(this.detail),
        );
        this.replaceChildren(styleNode(css as unknown as string), shell);
        this.bindRefs();
        void hydrateExecuteFields(this, this.detail, this.draft);
    }
    private bindRefs(): void {
        this.runButton = this.querySelector("[data-role='run']");
        this.resultStatus = this.querySelector("[data-role='result-status']");
        this.resultMessage = this.querySelector("[data-role='result-message']");
        this.resultBody = this.querySelector("[data-role='result-body']");
        this.runButton?.addEventListener("click", () => void this.execute());
        this.querySelector("[data-role='reset']")?.addEventListener("click", () => {
            this.resetDraft();
            this.renderDetail();
        });
    }
    private async onInputChange(path?: string): Promise<void> {
        this.clearResult();
        if (path && this.detail) {
            await seedDependents(this, this.detail, path, this.draft);
        }
    }
    private async execute(): Promise<void> {
        if (!this.detail || !this.runButton) {
            return;
        }
        try {
            this.draft = this.detail.ui?.execute?.fields?.length
                ? readPathDraft(this, this.draft)
                : readFallbackDraft(this, Boolean(this.detail.body));
        } catch (error) {
            this.showResult({
                ok: false,
                status: 0,
                contentType: "application/json",
                body: { error: error instanceof Error ? error.message : "Invalid input" },
            });
            return;
        }
        this.runButton.disabled = true;
        this.runButton.textContent = "Running...";
        this.showPending();
        try {
            this.showResult(
                await executeFunctionDetail({
                    id: this.detail.id,
                    params: this.draft.params,
                    body: this.draft.body,
                    includeBody: Boolean(this.detail.body),
                }),
            );
        } catch (error) {
            this.showResult({
                ok: false,
                status: 0,
                contentType: "application/json",
                body: { error: error instanceof Error ? error.message : "Execution failed" },
            });
        } finally {
            this.runButton.disabled = false;
            this.runButton.textContent = "Run";
        }
    }
    private showPending(): void {
        this.setResult("status", "Running", "Waiting for response...", "");
    }
    private clearResult(): void {
        this.setResult("status", "Not executed", "Run the function to see its result.", "");
    }
    private showResult(result: FunctionExecutionResult): void {
        this.setResult(
            `status ${result.ok ? "ok" : "error"}`,
            result.status ? String(result.status) : "Invalid input",
            readableResult(result),
            stringify(result.body),
        );
    }
    private setResult(statusClass: string, status: string, message: string, body: string): void {
        if (this.resultStatus) {
            this.resultStatus.className = statusClass;
            this.resultStatus.textContent = status;
        }
        if (this.resultMessage) {
            this.resultMessage.textContent = message;
        }
        if (this.resultBody) {
            this.resultBody.textContent = body;
        }
    }
}
if (!customElements.get("cms-function-detail")) {
    customElements.define("cms-function-detail", CmsFunctionDetail);
}
