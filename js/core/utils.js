"use strict";

/* PRIORIZA — utilitários centrais de segurança e confiabilidade (Sprint 043). */
(function criarPriorizaUtils() {
  const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
  const activeReads = new Map();
  const readVersions = new Map();
  const pendingReads = new Map();
  let globalErrorsBound = false;
  const submittingForms = new WeakSet();

  function isDevelopment() {
    return DEVELOPMENT_HOSTS.has(window.location.hostname);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function debugLog(...args) { if (isDevelopment()) console.log(...args); }
  function debugWarn(...args) { if (isDevelopment()) console.warn(...args); }
  function debugError(...args) { if (isDevelopment()) console.error(...args); }

  function composeSignal(signals) {
    const valid = signals.filter(Boolean);
    if (!valid.length) return undefined;
    if (typeof AbortSignal.any === "function") return AbortSignal.any(valid);
    const controller = new AbortController();
    valid.forEach((signal) => {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    });
    return controller.signal;
  }

  async function fetchWithTimeout(input, options = {}) {
    const timeoutMs = Number(options.timeoutMs || 20000);
    const timeoutController = new AbortController();
    const timeoutId = window.setTimeout(() => timeoutController.abort("timeout"), timeoutMs);
    const signal = composeSignal([options.signal, timeoutController.signal]);
    const fetchOptions = { ...options, signal };
    delete fetchOptions.timeoutMs;
    try {
      return await window.fetch(input, fetchOptions);
    } catch (error) {
      if (timeoutController.signal.aborted && !options.signal?.aborted) {
        const timeoutError = new Error("A operação demorou mais que o esperado. Tente novamente.");
        timeoutError.name = "TimeoutError";
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function cancelRead(scope) {
    readVersions.set(scope, (readVersions.get(scope) || 0) + 1);
    activeReads.get(scope)?.controller.abort("superseded");
    activeReads.delete(scope);
  }

  function cancelAllReads() {
    activeReads.forEach(({ controller }, scope) => {
      readVersions.set(scope, (readVersions.get(scope) || 0) + 1);
      controller.abort("session-ended");
    });
    activeReads.clear();
    pendingReads.clear();
  }

  async function fetchLatest(scope, input, options = {}) {
    activeReads.get(scope)?.controller.abort("superseded");
    const controller = new AbortController();
    const version = (readVersions.get(scope) || 0) + 1;
    readVersions.set(scope, version);
    activeReads.set(scope, { controller, version });
    try {
      const response = await fetchWithTimeout(input, { ...options, signal: composeSignal([options.signal, controller.signal]) });
      if (readVersions.get(scope) !== version) return null;
      return response;
    } finally {
      if (activeReads.get(scope)?.version === version) activeReads.delete(scope);
    }
  }

  function fetchDeduped(key, input, options = {}) {
    if (pendingReads.has(key)) return pendingReads.get(key);
    const promise = fetchWithTimeout(input, options).finally(() => pendingReads.delete(key));
    pendingReads.set(key, promise);
    return promise;
  }

  function bindGlobalErrorHandling() {
    if (globalErrorsBound) return;
    globalErrorsBound = true;
    window.addEventListener("error", (event) => {
      debugError("[PRIORIZA] Erro global", { message: String(event.message || "Erro inesperado"), source: event.filename ? "script" : "runtime" });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      if (reason?.name === "AbortError") return;
      debugError("[PRIORIZA] Rejeição não tratada", { name: String(reason?.name || "Error"), message: String(reason?.message || "Falha inesperada") });
    });
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
    try {
      return await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    } catch (error) {
      debugWarn("[PRIORIZA] Service Worker indisponivel", { name: error?.name });
      return null;
    }
  }

  function acquireFormSubmission(form) {
    if (!form || submittingForms.has(form)) return null;
    submittingForms.add(form);
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    return () => {
      submittingForms.delete(form);
      if (button) button.disabled = false;
    };
  }

  window.PriorizaUtils = Object.freeze({
    escapeHTML,
    isDevelopment,
    debugLog,
    debugWarn,
    debugError,
    fetchWithTimeout,
    fetchLatest,
    fetchDeduped,
    cancelRead,
    cancelAllReads,
    bindGlobalErrorHandling,
    registerServiceWorker,
    acquireFormSubmission,
  });
})();
