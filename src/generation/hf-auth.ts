"use client";

import { oauthHandleRedirectIfPresent, oauthLoginUrl } from "@huggingface/hub";

const STORAGE_KEY = "openhiggsfield.hf-oauth.v1";
export type HFSession = { accessToken: string; accessTokenExpiresAt?: number; userInfo?: unknown };

function read(): HFSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as HFSession;
    if (!session.accessToken) return null;
    if (session.accessTokenExpiresAt && Date.now() >= session.accessTokenExpiresAt - 30_000) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch { return null; }
}
function store(session: HFSession | null) { if (!session) window.localStorage.removeItem(STORAGE_KEY); else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); }

export async function initHFSession(): Promise<HFSession | null> {
  const existing = read();
  if (existing) return existing;
  try {
    const oauthResult = await oauthHandleRedirectIfPresent();
    if (!oauthResult || !oauthResult.accessToken) return null;
    const session: HFSession = {
      accessToken: oauthResult.accessToken,
      accessTokenExpiresAt: oauthResult.accessTokenExpiresAt instanceof Date ? oauthResult.accessTokenExpiresAt.getTime() : undefined,
      userInfo: oauthResult.userInfo,
    };
    store(session);
    return session;
  } catch { return null; }
}

export async function signInWithHF() {
  window.location.href = await oauthLoginUrl({ redirectUrl: window.location.href.split("?")[0] });
}
export function signOutHF() { store(null); }
export async function getHFToken() { return (await initHFSession())?.accessToken; }
