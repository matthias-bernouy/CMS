/**
 * Browser-safe subset of @bernouy/http-runner — pure string/Response helpers
 * with zero Bun/Node imports, so web-component bundles can import them
 * without dragging the server runner.
 */

export { escapeHtml, escapeAttr, htmlResponse, redirect } from "http-runner/core/html";
