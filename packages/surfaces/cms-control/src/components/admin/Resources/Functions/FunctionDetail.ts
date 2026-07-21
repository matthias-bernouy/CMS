import "cms-control/components/admin/ShellDetail/ShellDetail";
import {
    currentFunctionId,
    executeFunctionDetail,
    fetchFunctionDetail,
    type FunctionDetail,
    type FunctionExecutionResult,
} from "./api";
import { backLink, button, detailSection, div, keyValues, pre, schemaBlock, state, styleNode, title } from "./dom";
import { initialDraft, readFallbackDraft, readPathDraft, stringify } from "./draft";
import { executeFields, hydrateExecuteFields, seedDependents } from "./fields";
import { readableResult } from "./result";
import type { FunctionDraft } from "./types";
import css from "./style.css" with { type: "text" };
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
            this.headerActions(),
            this.inputsSection(),
            this.resultSection(),
            this.summarySection(),
            this.contractSection(),
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
    private headerActions(): HTMLElement {
        const wrap = div("header-actions");
        wrap.slot = "actions";
        const reset = button("Reset draft", "secondary");
        const run = button("Run", "primary");
        reset.dataset.role = "reset";
        run.dataset.role = "run";
        wrap.append(reset, run);
        return wrap;
    }
    private inputsSection(): HTMLElement {
        const section = detailSection("main", "Inputs");
        if (this.detail) {
            section.append(executeFields(this.detail, this.draft, (path) => void this.onInputChange(path)));
        }
        return section;
    }
    private resultSection(): HTMLElement {
        const section = detailSection("main", "Result");
        const status = div("status", "Not executed");
        const message = div("result-message empty", "Run the function to see its result.");
        const raw = document.createElement("details");
        status.dataset.role = "result-status";
        message.dataset.role = "result-message";
        raw.className = "raw-result";
        raw.append(summary("Raw response"), pre(""));
        raw.querySelector("pre")!.dataset.role = "result-body";
        section.append(div("result-header", status), message, raw);
        return section;
    }
    private summarySection(): HTMLElement {
        const d = this.detail!;
        const section = detailSection("aside", "Function");
        section.append(
            keyValues([
                ["Id", d.id],
                ["Method", d.method],
                ["Access", d.access],
                ["Input", d.inputLabel],
                ["Steps", d.stepsLabel],
                ["Return", d.returnLabel],
            ]),
        );
        return section;
    }
    private contractSection(): HTMLElement {
        const d = this.detail!;
        const section = detailSection("aside", "Contract");
        const details = document.createElement("details");
        details.append(
            summary("Schemas"),
            schemaBlock("Params", d.params ?? null),
            schemaBlock("Body", d.body ?? null),
            schemaBlock("Output", d.output ?? null),
        );
        section.append(details);
        return section;
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
function summary(text: string): HTMLElement {
    const el = document.createElement("summary");
    el.textContent = text;
    return el;
}
