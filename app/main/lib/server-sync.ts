import log from "electron-log";
import { getSettings } from "./store";

export interface ServerState {
  settings: { glassMl: number; dailyGoalMl: number };
  drankMl: number;
  nextAt: number | null;
  active: boolean;
}

let state: ServerState | null = null;
let stop: AbortController | null = null;

export function serverUrl(): string {
  return (getSettings().serverUrl ?? "").trim().replace(/\/+$/, "");
}

export function getServerState(): ServerState | null {
  return state;
}

export function postAction(action: string): void {
  fetch(`${serverUrl()}/api/${action}`, { method: "POST" }).catch((err) =>
    log.error(`Server action ${action} failed: ${err}`),
  );
}

// Keep an SSE connection to the server open, reconnecting forever.
export function connectServer(onState: (s: ServerState) => void): void {
  stop?.abort();
  state = null;
  const url = serverUrl();
  if (!url) return;

  const ctrl = new AbortController();
  stop = ctrl;

  (async () => {
    while (!ctrl.signal.aborted) {
      // The server pings every 25s; a silent minute means a dead connection.
      const watchdog = new AbortController();
      let timer = setTimeout(() => watchdog.abort(), 60_000);
      try {
        const res = await fetch(`${url}/api/events`, {
          signal: AbortSignal.any([ctrl.signal, watchdog.signal]),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        log.info(`Connected to Drinky server ${url}`);
        const decoder = new TextDecoder();
        let buf = "";
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          clearTimeout(timer);
          timer = setTimeout(() => watchdog.abort(), 60_000);
          buf += decoder.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (event.startsWith("data: ")) {
              state = JSON.parse(event.slice(6)) as ServerState;
              onState(state);
            }
          }
        }
      } catch (err) {
        if (!ctrl.signal.aborted) log.warn(`Drinky server: ${err}`);
      } finally {
        clearTimeout(timer);
      }
      if (!ctrl.signal.aborted) await new Promise((r) => setTimeout(r, 5000));
    }
  })();
}
