/**
 * Browser-safe subset of @bernouy/http-runner — pure string/Response helpers
 * with zero Bun/Node imports, so web-component bundles can import them
 * without dragging the server runner.
 */

export { escapeHtml, escapeAttr, htmlResponse, redirect } from "http-runner/core/html";
export { createHttpErrorPages, type HttpErrorStatus } from "http-runner/core/html/errorDocument";
export { staticErrorResponse } from "http-runner/core/html/errorResponse";

export { selectErrorLanguage, type ErrorPageLanguage } from "http-runner/core/html/language";
