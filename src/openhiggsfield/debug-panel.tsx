"use client";

import { useEffect, useState } from "react";
import { clearGenerationDebugLog, getGenerationDebugLog } from "@/generation/actions";

type Entry = ReturnType<typeof getGenerationDebugLog>[number];

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const refresh = () => setEntries(getGenerationDebugLog());
    refresh();
    const timer = window.setInterval(refresh, 750);
    return () => window.clearInterval(timer);
  }, []);

  const errors = entries.filter((entry) => entry.level === "error").length;
  const warnings = entries.filter((entry) => entry.level === "warn").length;

  const copy = async () => {
    const text = JSON.stringify(entries, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setOpen(true);
    } catch {
      window.prompt("Copy generation diagnostics:", text);
    }
  };

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 99999, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }}>
      {open && (
        <div style={{ width: "min(94vw, 760px)", maxHeight: "62vh", overflow: "hidden", marginBottom: 8, background: "#090a0b", color: "#e7ebea", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, boxShadow: "0 16px 60px rgba(0,0,0,.55)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,.09)" }}>
            <strong>Generation diagnostics</strong>
            <span style={{ opacity: .7 }}>{entries.length} events · {errors} errors · {warnings} warnings</span>
          </div>
          <pre style={{ margin: 0, padding: 12, maxHeight: "50vh", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {entries.length === 0 ? "No generation events yet. Press Generate, then reopen this panel." : entries.slice(-120).map((entry, index) => {
              const line = `${entry.ts} [${entry.level.toUpperCase()}] ${entry.event}${entry.requestId ? ` request=${entry.requestId}` : ""}${entry.model ? ` model=${entry.model}` : ""}${entry.space ? ` space=${entry.space}` : ""}${entry.apiName ? ` api=${entry.apiName}` : ""}`;
              return `${index ? "\n" : ""}${line}${entry.details ? `\n  ${JSON.stringify(entry.details)}` : ""}`;
            }).join("")}
          </pre>
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid rgba(255,255,255,.09)" }}>
            <button type="button" onClick={() => void copy()} style={{ padding: "7px 10px", borderRadius: 8, background: "#1c2022", color: "#e7ebea", border: "1px solid rgba(255,255,255,.12)" }}>Copy log</button>
            <button type="button" onClick={() => { clearGenerationDebugLog(); setEntries([]); }} style={{ padding: "7px 10px", borderRadius: 8, background: "#1c2022", color: "#e7ebea", border: "1px solid rgba(255,255,255,.12)" }}>Clear</button>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: "7px 10px", borderRadius: 8, background: "#1c2022", color: "#e7ebea", border: "1px solid rgba(255,255,255,.12)", marginLeft: "auto" }}>Close</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ padding: "8px 10px", borderRadius: 9, background: "#101213", color: "#cfd5d3", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 5px 24px rgba(0,0,0,.35)" }}>
        DEBUG{errors ? ` · ${errors} ERR` : warnings ? ` · ${warnings} WARN` : ""}
      </button>
    </div>
  );
}
