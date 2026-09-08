"use client";

import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import { MissingCredentialsError, parseCredentialInput } from "./credentials";
import { createPlatformClient } from "./platform";
import type { StatusResult } from "./platform";
import { toPlatform } from "./to-platform";

const STORAGE_KEY = "openhiggsfield.platform.apiKey";
const DEFAULT_BASE_URL = "https://platform.higgsfield.ai";

export async function savePlatformCredentials(data: unknown) {
  const { apiKey } = parseCredentialInput(data);
  window.localStorage.setItem(STORAGE_KEY, apiKey);
}

export async function clearPlatformCredentials() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function hasPlatformCredentials() {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

function readCredentials() {
  const apiKey = window.localStorage.getItem(STORAGE_KEY);
  if (!apiKey) throw new MissingCredentialsError();
  return createPlatformClient({ apiKey, baseUrl: DEFAULT_BASE_URL });
}

export async function submitGeneration(plane: GenerationPlane) {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = { ...plane, settings: parseSettings(model, plane.settings) };
  const { path, body } = toPlatform(parsed);
  return readCredentials().submit(path, body);
}

export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid status payload");
  }
  const requestIds = (data as { requestIds?: unknown }).requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0 || requestIds.some((id) => typeof id !== "string" || !id)) {
    throw new Error("Invalid request ids");
  }
  const client = readCredentials();
  return Promise.all(requestIds.map(async (requestId: string) => {
    try {
      return { requestId, status: await client.status(requestId) };
    } catch (caught) {
      return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
    }
  }));
}
