"use client";

import { Client } from "@gradio/client";

import { getModel } from "./catalog";
import type { GenerationPlane } from "./plane";
import { getHFToken } from "./hf-auth";
import type { GenerationStatus, StatusResult, QueuedGeneration } from "./platform";

const jobs = new Map<string, Promise<GenerationStatus>>();
const CLIENTS = new Map<string, Promise<Awaited<ReturnType<typeof Client.connect>>>>();

const SPACES = {
  zImage: "https://mrfakename-z-image-turbo.hf.space",
  fluxSchnell: "https://evalstate-flux1-schnell.hf.space",
  wan5b: "https://pragya2-7-wan-2-2-5b-video.hf.space",
  wan14b: "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
  ltx: "https://lightricks-ltx-video-distilled.hf.space",
} as const;

function id() {
  return `free-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function clientFor(space: string) {
  const token = await getHFToken();
  const cacheKey = `${space}|${token ?? "anonymous"}`;
  let client = CLIENTS.get(cacheKey);
  if (!client) {
    client = Client.connect(space, token ? { token } : undefined);
    CLIENTS.set(cacheKey, client);
  }
  try {
    return await client;
  } catch (error) {
    CLIENTS.delete(cacheKey);
    throw error;
  }
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "path"]) {
      const found = record[key];
      if (typeof found === "string" && found.startsWith("http")) return found;
    }
    for (const item of Object.values(record)) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  return undefined;
}

async function predictWithRetry(space: string, apiName: string, inputs: unknown[], retries = 1): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const app = await clientFor(space);
      const result = await app.predict(apiName, inputs);
      return result.data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function dimensionsForRatio(ratio: string, maxArea = 786432): [number, number] {
  const presets: Record<string, [number, number]> = {
    "1:1": [768, 768],
    "16:9": [1024, 576],
    "9:16": [576, 1024],
    "4:3": [896, 672],
    "3:4": [672, 896],
    "3:2": [960, 640],
    "2:3": [640, 960],
  };
  let [w, h] = presets[ratio] ?? presets["1:1"]!;
  if (w * h > maxArea) {
    const scale = Math.sqrt(maxArea / (w * h));
    w = Math.max(512, Math.round((w * scale) / 32) * 32);
    h = Math.max(512, Math.round((h * scale) / 32) * 32);
  }
  return [w, h];
}

function inputImage(plane: GenerationPlane) {
  const media = Object.values(plane.media).flat();
  return media.find((item) => item.role === "start") ?? media.find((item) => item.role === "reference") ?? media[0];
}

async function runFreeModel(plane: GenerationPlane, requestId: string): Promise<GenerationStatus> {
  const model = getModel(plane.model);
  if (model.surface === "image") {
    const ratio = typeof plane.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "1:1";
    const [width, height] = dimensionsForRatio(ratio);
    const imageSpace = plane.model === "flux-schnell-free" ? SPACES.fluxSchnell : SPACES.zImage;
    const apiName = plane.model === "flux-schnell-free" ? "/infer" : "/generate_image";
    const inputs = plane.model === "flux-schnell-free"
      ? [plane.prompt.text, Math.floor(Math.random() * 2_147_483_647), true, width, height, 4]
      : [plane.prompt.text, height, width, 8, Math.floor(Math.random() * 2 ** 32), true];
    let result: unknown;
    try {
      result = await predictWithRetry(imageSpace, apiName, inputs, 1);
    } catch (primaryError) {
      if (plane.model !== "flux-schnell-free") {
        result = await predictWithRetry(SPACES.fluxSchnell, "/infer", [plane.prompt.text, 0, true, width, height, 4], 1);
      } else {
        throw primaryError;
      }
    }
    const url = firstUrl(result);
    if (!url) throw new Error("The free image model returned no image URL.");
    return { status: "completed", requestId, images: [{ url }] };
  }

  const ratio = typeof plane.settings.aspectRatio === "string" ? plane.settings.aspectRatio : "16:9";
  const duration = Math.min(3, Math.max(1, Number(plane.settings.duration) || 2));
  const [width, height] = dimensionsForRatio(ratio, 589824);
  const media = inputImage(plane);
  const imageUrl = media?.url;

  if (plane.model === "wan-2-2-14b-i2v-free") {
    if (!imageUrl) throw new Error("Wan 2.2 14B Fast needs an input image. Attach an image first.");
    const result = await predictWithRetry(SPACES.wan14b, "/generate_video", [
      { url: imageUrl }, plane.prompt.text, 6,
      "worst quality, blurry, watermark, jittery", duration, 1, 1,
      Math.floor(Math.random() * 2_147_483_647), true,
    ], 1);
    const url = firstUrl(result);
    if (!url) throw new Error("Wan 2.2 14B Fast returned no video URL.");
    return { status: "completed", requestId, video: { url } };
  }

  if (plane.model === "ltx-video-free") {
    const result = await predictWithRetry(SPACES.ltx, "/text_to_video", [
      plane.prompt.text,
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark",
      imageUrl ?? null, null, height, width,
      imageUrl ? "image-to-video" : "text-to-video", duration, 9,
      Math.floor(Math.random() * 2_147_483_647), true, 1, true,
    ], 1);
    const url = firstUrl(result);
    if (!url) throw new Error("LTX Video returned no video URL.");
    return { status: "completed", requestId, video: { url } };
  }

  try {
    const result = await predictWithRetry(SPACES.wan5b, "/generate_video", [
      imageUrl ? { url: imageUrl } : null,
      plane.prompt.text,
      height,
      width,
      "Bright tones, overexposed, static, blurred details, subtitles, worst quality, low quality, watermark, text, signature",
      duration, 4, 6, Math.floor(Math.random() * 2_147_483_647), true,
    ], 1);
    const url = firstUrl(result);
    if (!url) throw new Error("Wan 2.2 5B returned no video URL.");
    return { status: "completed", requestId, video: { url } };
  } catch (wanError) {
    const result = await predictWithRetry(SPACES.ltx, "/text_to_video", [
      plane.prompt.text,
      "worst quality, inconsistent motion, blurry, jittery, distorted, watermark",
      imageUrl ?? null, null, 512, 704,
      imageUrl ? "image-to-video" : "text-to-video", Math.min(2, duration), 9,
      Math.floor(Math.random() * 2_147_483_647), true, 1, true,
    ], 0);
    const url = firstUrl(result);
    if (!url) throw wanError instanceof Error ? wanError : new Error(String(wanError));
    return { status: "completed", requestId, video: { url } };
  }
}

export async function savePlatformCredentials(_data: unknown) {}
export async function clearPlatformCredentials() {}
export async function hasPlatformCredentials() { return true; }

export async function submitGeneration(plane: GenerationPlane): Promise<QueuedGeneration> {
  const requestId = id();
  const promise = runFreeModel(plane, requestId).catch((error) => ({
    status: "failed",
    requestId,
    error: error instanceof Error ? error.message : String(error),
  }));
  jobs.set(requestId, promise);
  void promise.finally(() => window.setTimeout(() => jobs.delete(requestId), 30 * 60_000));
  return { status: "queued", requestId, statusUrl: "", cancelUrl: "" };
}

export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const ids = (data as { requestIds?: unknown })?.requestIds;
  if (!Array.isArray(ids)) throw new Error("Invalid request ids");
  return Promise.all(ids.filter((value): value is string => typeof value === "string").map(async (requestId) => {
    const job = jobs.get(requestId);
    if (!job) return { requestId, error: "This generation job is no longer available in this browser session." };
    const current = await Promise.race([
      job.then((status) => ({ done: true as const, status })),
      new Promise<{ done: false }>((resolve) => window.setTimeout(() => resolve({ done: false }), 250)),
    ]);
    if (current.done) return { requestId, status: current.status };
    return { requestId, status: { status: "processing", requestId } };
  }));
}
