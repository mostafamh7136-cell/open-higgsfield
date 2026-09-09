"use client";

import { Client, handle_file } from "@gradio/client";
import { getModel } from "./catalog";
import type { GenerationPlane } from "./plane";
import { getHFToken } from "./hf-auth";
import type { GenerationStatus, StatusResult, QueuedGeneration } from "./platform";

const jobs = new Map<string, Promise<GenerationStatus>>();
const CLIENTS = new Map<string, Promise<Awaited<ReturnType<typeof Client.connect>>>>();
const DEBUG_KEY = "openhiggsfield.generation-debug.v1";
const MAX_DEBUG_ENTRIES = 250;

const SPACES = {
  zImage: "mrfakename/Z-Image-Turbo",
  fluxSchnell: "black-forest-labs/FLUX.1-schnell",
  wan5b: "pragya2-7/wan-2-2-5b-video",
  wan14b: "zerogpu-aoti/wan2-2-fp8da-aoti-faster",
  ltx: "Lightricks/ltx-video-distilled",
} as const;

type DebugLevel = "info" | "warn" | "error";
type DebugEntry = {
  ts: string;
  level: DebugLevel;
  event: string;
  requestId?: string;
  model?: string;
  space?: string;
  apiName?: string;
  details?: Record<string, unknown>;
};

function safeDetails(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 700 ? `${value.slice(0, 700)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack?.slice(0, 1600) };
  if (Array.isArray(value)) return value.slice(0, 20).map(safeDetails);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).slice(0, 40).map(([key, item]) => [key, safeDetails(item)]));
  }
  return String(value);
}

function readDebug(): DebugEntry[] {
  try {
    const raw = window.localStorage.getItem(DEBUG_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as DebugEntry[] : [];
  } catch {
    return [];
  }
}

function writeDebug(entry: DebugEntry) {
  try {
    const next = [...readDebug(), entry].slice(-MAX_DEBUG_ENTRIES);
    window.localStorage.setItem(DEBUG_KEY, JSON.stringify(next));
  } catch {
    // Diagnostics must never break generation when storage is unavailable.
  }
}

function debug(level: DebugLevel, event: string, context: Partial<Omit<DebugEntry, "ts" | "level" | "event">> = {}) {
  const entry: DebugEntry = { ts: new Date().toISOString(), level, event, ...context };
  const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  consoleMethod(`[OpenHiggsfield:${event}]`, entry);
  writeDebug(entry);
}

export function getGenerationDebugLog(): DebugEntry[] {
  return readDebug();
}

export function clearGenerationDebugLog() {
  try { window.localStorage.removeItem(DEBUG_KEY); } catch { /* ignore */ }
  console.info("[OpenHiggsfield:debug-cleared]");
}

function exposeDiagnostics() {
  const target = window as Window & {
    __OPENHIGGSFIELD_DEBUG__?: {
      getLog: () => DebugEntry[];
      clear: () => void;
      copy: () => Promise<void>;
    };
  };
  target.__OPENHIGGSFIELD_DEBUG__ = {
    getLog: getGenerationDebugLog,
    clear: clearGenerationDebugLog,
    copy: async () => {
      const text = JSON.stringify(getGenerationDebugLog(), null, 2);
      await navigator.clipboard.writeText(text);
      console.info("[OpenHiggsfield:debug-copied]", `${text.length} chars`);
    },
  };
}

if (typeof window !== "undefined") exposeDiagnostics();

function id() { return `free-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function spaceHost(space: string): string {
  return `https://${space.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.hf.space`;
}

async function clientFor(space: string, requestId?: string) {
  const token = await getHFToken();
  const cacheKey = `${space}|${token ? "authenticated" : "anonymous"}`;
  debug("info", "client-connect-start", { requestId, space, details: { authenticated: Boolean(token), cacheKey } });
  let client = CLIENTS.get(cacheKey);
  if (!client) {
    client = Client.connect(space, token ? { token: token as `hf_${string}` } : undefined);
    CLIENTS.set(cacheKey, client);
  }
  try {
    const connected = await client;
    debug("info", "client-connect-success", { requestId, space });
    return connected;
  } catch (error) {
    CLIENTS.delete(cacheKey);
    debug("error", "client-connect-failed", { requestId, space, details: safeDetails(error) as Record<string, unknown> });
    throw error;
  }
}

async function prepareFile(value: string, requestId?: string) {
  debug("info", "input-file-prepare", { requestId, details: { kind: value.startsWith("blob:") ? "blob" : value.startsWith("data:") ? "data" : "remote", valuePrefix: value.slice(0, 120) } });
  try {
    if (value.startsWith("blob:") || value.startsWith("data:")) {
      const response = await fetch(value);
      if (!response.ok) throw new Error(`Could not read local media (${response.status}).`);
      const blob = await response.blob();
      debug("info", "input-file-local-ready", { requestId, details: { bytes: blob.size, contentType: blob.type || "unknown" } });
      return handle_file(blob);
    }
    const prepared = handle_file(value);
    debug("info", "input-file-remote-ready", { requestId });
    return prepared;
  } catch (error) {
    debug("error", "input-file-prepare-failed", { requestId, details: safeDetails(error) as Record<string, unknown> });
    throw error;
  }
}

function toAbsoluteUrl(value: string, space: string): string | undefined {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return new URL(value, `${spaceHost(space)}/`).toString();
  return undefined;
}

function firstUrl(value: unknown, space: string): string | undefined {
  if (typeof value === "string") return toAbsoluteUrl(value, space);
  if (Array.isArray(value)) for (const item of value) { const url = firstUrl(item, space); if (url) return url; }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "path"]) {
      const candidate = record[key];
      if (typeof candidate === "string") { const url = toAbsoluteUrl(candidate, space); if (url) return url; }
    }
    for (const item of Object.values(record)) { const url = firstUrl(item, space); if (url) return url; }
  }
  return undefined;
}

function summarizeInputs(inputs: unknown[]): unknown[] {
  return inputs.map((input, index) => {
    if (input === null || input === undefined) return { index, kind: "null" };
    if (typeof input === "string") return { index, kind: "string", preview: input.length > 120 ? `${input.slice(0, 120)}…` : input };
    if (typeof input === "number" || typeof input === "boolean") return { index, kind: typeof input, value: input };
    return { index, kind: typeof input, value: safeDetails(input) };
  });
}

async function predictWithRetry(space: string, apiName: string, inputs: unknown[], requestId: string, retries = 1): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    try {
      debug("info", "predict-start", { requestId, space, apiName, details: { attempt: attempt + 1, maxAttempts: retries + 1, inputs: summarizeInputs(inputs) } });
      const app = await clientFor(space, requestId);
      if (attempt === 0) {
        try {
          const api = await app.view_api();
          const endpoint = api.named_endpoints?.[apiName];
          debug(endpoint ? "info" : "error", endpoint ? "endpoint-found" : "endpoint-missing", {
            requestId,
            space,
            apiName,
            details: endpoint ? { endpoint: safeDetails(endpoint) } : { availableEndpoints: Object.keys(api.named_endpoints ?? {}) },
          });
          if (!endpoint) throw new Error(`Missing Gradio endpoint ${apiName}. Available endpoints: ${Object.keys(api.named_endpoints ?? {}).join(", ") || "none"}`);
        } catch (error) {
          debug("error", "view-api-failed", { requestId, space, apiName, details: safeDetails(error) as Record<string, unknown> });
          throw error;
        }
      }
      const result = await app.predict(apiName, inputs);
      debug("info", "predict-success", { requestId, space, apiName, details: { elapsedMs: Date.now() - started, result: safeDetails(result?.data) } });
      return result.data;
    } catch (error) {
      last = error;
      debug(attempt < retries ? "warn" : "error", "predict-failed", {
        requestId,
        space,
        apiName,
        details: { attempt: attempt + 1, elapsedMs: Date.now() - started, error: safeDetails(error) },
      });
      if (attempt < retries) {
        const delay = 1500 * (attempt + 1);
        debug("info", "predict-retry-wait", { requestId, space, apiName, details: { delayMs: delay } });
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function dims(r: string, maxArea = 786432): [number, number] {
  const p: Record<string, [number, number]> = { "1:1":[768,768], "16:9":[1024,576], "9:16":[576,1024], "4:3":[896,672], "3:4":[672,896], "3:2":[960,640], "2:3":[640,960] };
  let [w, h] = p[r] ?? p["1:1"]!;
  if (w * h > maxArea) { const s = Math.sqrt(maxArea / (w * h)); w = Math.max(512, Math.round((w * s) / 32) * 32); h = Math.max(512, Math.round((h * s) / 32) * 32); }
  return [w, h];
}

function inputImage(plane: GenerationPlane) {
  const media = Object.values(plane.media).flat();
  return media.find((item) => item.role === "start") ?? media.find((item) => item.role === "reference") ?? media[0];
}

async function verifyArtifact(url: string, kind: "image" | "video", requestId: string, space: string) {
  const started = Date.now();
  debug("info", "artifact-verify-start", { requestId, space, details: { kind, url } });
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    const contentType = response.headers.get("content-type") || "unknown";
    const bytes = (await response.arrayBuffer()).byteLength;
    debug(response.ok && bytes > 1024 ? "info" : "error", response.ok && bytes > 1024 ? "artifact-verify-success" : "artifact-verify-failed", {
      requestId,
      space,
      details: { kind, status: response.status, contentType, bytes, elapsedMs: Date.now() - started },
    });
    if (!response.ok) throw new Error(`Generated ${kind} could not be fetched (${response.status}).`);
    if (bytes <= 1024) throw new Error(`Generated ${kind} is unexpectedly small (${bytes} bytes).`);
  } catch (error) {
    debug("error", "artifact-verify-error", { requestId, space, details: safeDetails(error) as Record<string, unknown> });
  }
}

async function runFreeModel(plane: GenerationPlane, requestId: string): Promise<GenerationStatus> {
  const model = getModel(plane.model);
  debug("info", "generation-start", { requestId, model: model.id, details: { label: model.label, surface: model.surface, promptLength: plane.prompt.text.length, settings: safeDetails(plane.settings) as Record<string, unknown> } });

  if (model.surface === "image") {
    const ratio = typeof plane.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "1:1";
    const [width, height] = dims(ratio);
    const imageSpace = plane.model === "flux-schnell-free" ? SPACES.fluxSchnell : SPACES.zImage;
    const apiName = plane.model === "flux-schnell-free" ? "/infer" : "/generate_image";
    const inputs = plane.model === "flux-schnell-free"
      ? [plane.prompt.text, Math.floor(Math.random() * 2147483647), true, width, height, 4]
      : [plane.prompt.text, height, width, 8, Math.floor(Math.random() * 2 ** 32), true];
    const result = await predictWithRetry(imageSpace, apiName, inputs, requestId, 2);
    const url = firstUrl(result, imageSpace);
    debug(url ? "info" : "error", url ? "image-url-found" : "image-url-missing", { requestId, model: model.id, space: imageSpace, apiName, details: { url: url ?? null } });
    if (!url) throw new Error(`${model.label} returned no usable image URL.`);
    void verifyArtifact(url, "image", requestId, imageSpace);
    return { status: "completed", requestId, images: [{ url }] };
  }

  const ratio = typeof plane.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "16:9";
  const duration = Math.min(8.5, Math.max(0.3, Number(plane.settings.duration) || 2));
  const [width, height] = dims(ratio, 589824);
  const media = inputImage(plane);
  const imageUrl = media?.url;
  debug("info", "video-input-selected", { requestId, model: model.id, details: { hasImage: Boolean(imageUrl), imageUrlPrefix: imageUrl?.slice(0, 160) ?? null, width, height, duration } });

  if (plane.model === "wan-2-2-14b-i2v-free") {
    if (!imageUrl) throw new Error("Wan 2.2 14B Fast needs an input image.");
    const result = await predictWithRetry(SPACES.wan14b, "/generate_video", [
      await prepareFile(imageUrl, requestId), plane.prompt.text, 6,
      "worst quality, blurry, watermark, jittery, distorted, deformed",
      Math.min(5, duration), 1, 1, Math.floor(Math.random() * 2147483647), true,
    ], requestId, 2);
    const url = firstUrl(result, SPACES.wan14b);
    debug(url ? "info" : "error", url ? "video-url-found" : "video-url-missing", { requestId, model: model.id, space: SPACES.wan14b, apiName: "/generate_video", details: { url: url ?? null } });
    if (!url) throw new Error("Wan 2.2 14B Fast returned no usable video URL.");
    void verifyArtifact(url, "video", requestId, SPACES.wan14b);
    return { status: "completed", requestId, video: { url } };
  }

  if (plane.model === "ltx-video-free") {
    const preparedImage = imageUrl ? await prepareFile(imageUrl, requestId) : null;
    const mode = preparedImage ? "image-to-video" : "text-to-video";
    const result = await predictWithRetry(SPACES.ltx, preparedImage ? "/image_to_video" : "/text_to_video", [
      plane.prompt.text,
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text, logo",
      preparedImage, null, height, width, mode,
      duration, 9, Math.floor(Math.random() * 2 ** 32), true, 3, false,
    ], requestId, 2);
    const url = firstUrl(result, SPACES.ltx);
    debug(url ? "info" : "error", url ? "video-url-found" : "video-url-missing", { requestId, model: model.id, space: SPACES.ltx, apiName: preparedImage ? "/image_to_video" : "/text_to_video", details: { url: url ?? null, mode } });
    if (!url) throw new Error(`LTX Video ${mode} returned no usable video URL.`);
    void verifyArtifact(url, "video", requestId, SPACES.ltx);
    return { status: "completed", requestId, video: { url } };
  }

  try {
    const result = await predictWithRetry(SPACES.wan5b, "/generate_video", [
      imageUrl ? await prepareFile(imageUrl, requestId) : null,
      plane.prompt.text, height, width,
      "Bright tones, overexposed, static, blurred details, subtitles, worst quality, low quality, watermark, text, signature",
      Math.min(5, duration), 4, 6, Math.floor(Math.random() * 2147483647), true,
    ], requestId, 2);
    const url = firstUrl(result, SPACES.wan5b);
    debug(url ? "info" : "error", url ? "video-url-found" : "video-url-missing", { requestId, model: model.id, space: SPACES.wan5b, apiName: "/generate_video", details: { url: url ?? null } });
    if (!url) throw new Error("Wan 2.2 5B returned no usable video URL.");
    void verifyArtifact(url, "video", requestId, SPACES.wan5b);
    return { status: "completed", requestId, video: { url } };
  } catch (wanError) {
    debug("warn", "wan5b-fallback-to-ltx", { requestId, model: model.id, details: { wanError: safeDetails(wanError) } });
    const fallback = await predictWithRetry(SPACES.ltx, "/text_to_video", [
      plane.prompt.text,
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark, text, logo",
      null, null, 512, 704, "text-to-video", Math.min(2, duration), 9,
      Math.floor(Math.random() * 2 ** 32), true, 3, false,
    ], requestId, 1);
    const url = firstUrl(fallback, SPACES.ltx);
    debug(url ? "info" : "error", url ? "fallback-video-url-found" : "fallback-video-url-missing", { requestId, model: model.id, space: SPACES.ltx, apiName: "/text_to_video", details: { url: url ?? null } });
    if (!url) throw wanError;
    void verifyArtifact(url, "video", requestId, SPACES.ltx);
    return { status: "completed", requestId, video: { url } };
  }
}

export async function savePlatformCredentials(_data: unknown) {}
export async function clearPlatformCredentials() {}
export async function hasPlatformCredentials() { return true; }

export async function submitGeneration(plane: GenerationPlane): Promise<QueuedGeneration> {
  const requestId = id();
  debug("info", "submit-generation", { requestId, model: plane.model, details: { promptLength: plane.prompt.text.length } });
  const promise = runFreeModel(plane, requestId).catch((error) => {
    debug("error", "generation-failed", { requestId, model: plane.model, details: safeDetails(error) as Record<string, unknown> });
    return { status: "failed", requestId, error: error instanceof Error ? error.message : String(error) };
  });
  jobs.set(requestId, promise);
  void promise.finally(() => {
    debug("info", "generation-promise-settled", { requestId, model: plane.model });
    window.setTimeout(() => jobs.delete(requestId), 30 * 60000);
  });
  return { status: "queued", requestId, statusUrl: "", cancelUrl: "" };
}

export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const ids = (data as { requestIds?: unknown })?.requestIds;
  if (!Array.isArray(ids)) throw new Error("Invalid request ids");
  const requestIds = ids.filter((value): value is string => typeof value === "string");
  debug("info", "poll-start", { details: { requestIds } });
  const results = await Promise.all(requestIds.map(async (requestId) => {
    const job = jobs.get(requestId);
    if (!job) {
      debug("error", "poll-job-missing", { requestId });
      return { requestId, error: "This generation job is no longer available in this browser session." };
    }
    const current = await Promise.race([
      job.then((status) => ({ done: true as const, status })),
      new Promise<{ done: false }>((resolve) => window.setTimeout(() => resolve({ done: false }), 250)),
    ]);
    if (current.done) {
      debug("info", "poll-terminal", { requestId, details: { status: current.status } });
      return { requestId, status: current.status };
    }
    debug("info", "poll-processing", { requestId });
    return { requestId, status: { status: "processing", requestId } };
  }));
  return results;
}
