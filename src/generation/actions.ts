"use client";

import type { GenerationPlane } from "./plane";
import type { GenerationStatus, StatusResult, QueuedGeneration } from "./platform";

const jobs = new Map<string, Promise<GenerationStatus>>();
const IMAGE_SPACE = "https://mrfakename-z-image-turbo.hf.space";
const VIDEO_SPACE = "https://lightricks-ltx-video-distilled.hf.space";

function id() {
  return `free-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    if (typeof record.url === "string" && record.url.startsWith("http")) return record.url;
    for (const item of Object.values(record)) {
      const found = firstUrl(item);
      if (found) return found;
    }
  }
  return undefined;
}

async function callSpace(baseUrl: string, apiName: string, input: unknown[]): Promise<unknown> {
  const queued = await fetch(`${baseUrl}/gradio_api/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: input }),
  });
  if (!queued.ok) throw new Error(`Free model Space rejected the request (${queued.status}).`);
  const { event_id: eventId } = (await queued.json()) as { event_id?: string };
  if (!eventId) throw new Error("Free model Space did not return a job id.");

  const response = await fetch(`${baseUrl}/gradio_api/call/${apiName}/${eventId}`);
  if (!response.ok || !response.body) throw new Error(`Free model Space status request failed (${response.status}).`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const dataLine = frame.match(/^data:\s*(.+)$/m)?.[1]?.trim();
      if (event === "error") throw new Error(dataLine || "Free model generation failed.");
      if (event === "complete" && dataLine) return JSON.parse(dataLine);
    }
  }
  throw new Error("Free model Space ended without a completed result.");
}

async function runFreeModel(plane: GenerationPlane, requestId: string): Promise<GenerationStatus> {
  if (plane.surface === "image") {
    const result = await callSpace(IMAGE_SPACE, "generate_image", [
      plane.prompt.text,
      1024,
      1024,
      9,
      Math.floor(Math.random() * 2 ** 32),
      true,
    ]);
    const url = firstUrl(result);
    if (!url) throw new Error("The free image model returned no image URL.");
    return { status: "completed", requestId, images: [{ url }] };
  }

  const result = await callSpace(VIDEO_SPACE, "text_to_video", [
    plane.prompt.text,
    "worst quality, blurry, watermark",
    "",
    "",
    512,
    768,
    "text-to-video",
    4,
    25,
    Math.floor(Math.random() * 2 ** 32),
    true,
    3,
    false,
  ]);
  const url = firstUrl(result);
  if (!url) throw new Error("The free video model returned no video URL.");
  return { status: "completed", requestId, video: { url } };
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
