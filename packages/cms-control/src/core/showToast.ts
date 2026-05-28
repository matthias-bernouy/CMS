import type { ToastStack } from "@bernouy/webcomponents";

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastOptions = {
    type?: ToastType;
    duration?: number;
};

export function showToast(message: string, options?: ToastOptions): void {
    let stack = document.querySelector("p9r-toast-stack") as ToastStack | null;
    if (!stack) {
        stack = document.createElement("p9r-toast-stack") as ToastStack;
        document.body.appendChild(stack);
    }
    stack.push(message, options);
}
