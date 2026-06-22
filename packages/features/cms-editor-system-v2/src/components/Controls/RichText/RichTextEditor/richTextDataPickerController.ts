import { asInterpolation } from "@bernouy/cms-content/editor";
import { parseDataScopes } from "./richTextAttributes";
import { matchingDataOptions, renderDataOptions } from "./richTextDataPicker";
import { flattenDataOptions, type DataOption } from "./richTextDataOptions";

export class RichTextDataPickerController {
    private _dataOptions: DataOption[] = [];

    constructor(
        private readonly _refs: {
            picker: () => HTMLElement;
            search: () => HTMLInputElement;
            list: () => HTMLElement;
            closeButton: () => HTMLButtonElement;
            rawScopes: () => string | null;
        },
        private readonly _actions: {
            saveSelection: () => void;
            restoreSelection: () => void;
            insertText: (text: string) => void;
            focusEditor: () => void;
            finish: () => void;
        },
    ) {}

    connect(): void {
        this._refs.search().addEventListener("input", this._render);
        this._refs.search().addEventListener("keydown", this._onSearchKeydown);
        this._refs.closeButton().addEventListener("click", this._onCloseClick);
    }

    disconnect(): void {
        this._refs.search().removeEventListener("input", this._render);
        this._refs.search().removeEventListener("keydown", this._onSearchKeydown);
        this._refs.closeButton().removeEventListener("click", this._onCloseClick);
    }

    open(): void {
        this._actions.saveSelection();
        this._dataOptions = flattenDataOptions(parseDataScopes(this._refs.rawScopes()));
        this._refs.search().value = "";
        this._render();
        this._refs.picker().hidden = false;
        this._refs.search().focus();
    }

    private insertExpression(expression: string): void {
        if (!expression) return;

        this._actions.insertText(asInterpolation(expression));
        this.close({ restoreFocus: false });
        this._actions.finish();
    }

    private close(options: { restoreFocus?: boolean } = {}): void {
        this._refs.picker().hidden = true;
        if (options.restoreFocus === false) return;

        this._actions.focusEditor();
        this._actions.restoreSelection();
    }

    private readonly _onSearchKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Enter") {
            event.preventDefault();
            const first = this._refs.list().querySelector<HTMLButtonElement>(".data-option");
            if (first) this.insertExpression(first.dataset.path ?? "");
        } else if (event.key === "Escape") {
            event.preventDefault();
            this.close();
        }
    };

    private readonly _render = (): void => {
        renderDataOptions(
            this._refs.list(),
            matchingDataOptions(this._dataOptions, this._refs.search().value),
            this._dataOptions.length,
            (path) => this.insertExpression(path),
        );
    };

    private readonly _onCloseClick = (): void => {
        this.close();
    };
}
