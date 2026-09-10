import { useEffect, useState } from "react";
import type { Step } from "@createflow-dongle/dfu";
import type { StickStatus } from "../../shared/ipc.js";

type State = "idle" | "running" | "ok" | "error";

function stepText(s: Step): string {
  switch (s.kind) {
    case "search": return "Looking for the stick…";
    case "touch": return "Dongle is running — sending it back to the bootloader…";
    case "wait-bootloader": return `Waiting for the bootloader… ${s.secondsLeft}s`;
    case "flash": {
      const p = s.progress;
      if (p.phase === "connecting") return "Talking to the bootloader…";
      if (p.phase === "init") return "Sending init packet…";
      if (p.phase === "firmware") return `Sending firmware… ${Math.round((100 * p.sent) / p.total)}%`;
      return "Transfer complete, the stick is restarting…";
    }
    case "done": return "Done.";
  }
}

function percent(s: Step | null): number {
  if (!s) return 0;
  if (s.kind === "done") return 100;
  if (s.kind !== "flash") return 3;
  const p = s.progress;
  if (p.phase === "connecting") return 5;
  if (p.phase === "init") return 8;
  if (p.phase === "done") return 100;
  return 10 + Math.round((88 * p.sent) / Math.max(1, p.total));
}

export function App() {
  const [status, setStatus] = useState<StickStatus>({ kind: "none" });
  const [state, setState] = useState<State>("idle");
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ version: string; firmwareVersion: string; firmwareBytes: number } | null>(null);

  useEffect(() => {
    void window.flasher.getInfo().then(setInfo);
    const offStatus = window.flasher.onStatus(setStatus);
    const offStep = window.flasher.onStep(setStep);
    return () => { offStatus(); offStep(); };
  }, []);

  async function flash() {
    setState("running"); setError(""); setStep(null);
    const r = await window.flasher.flash();
    if (r.ok) setState("ok");
    else { setError(r.error); setState("error"); }
  }

  const canFlash = status.kind !== "none" && state !== "running";

  return (
    <main>
      <header>
        <h1>createflow Dongle</h1>
        <p>Turns an nRF52840 USB stick into a wireless dongle for the Naya Create.</p>
      </header>

      <div className="status">
        <span className={"dot " + (status.kind === "bootloader" ? "ready" : status.kind === "bridge" ? "running" : "")} />
        <div className="text">
          {status.kind === "none" && <>No stick found.<small>Plug in an EBYTE E104-BT5040U. Fresh out of the box, it's ready to flash.</small></>}
          {status.kind === "bootloader" && <>Stick is ready to flash.<small>{status.path}</small></>}
          {status.kind === "bridge" && <>Dongle firmware is running.<small>{status.path} — flashing replaces it with the version bundled in this app.</small></>}
        </div>
      </div>

      <button className="primary" disabled={!canFlash} onClick={() => void flash()}>
        {state === "running" ? "Working…" : status.kind === "bridge" ? "Update firmware" : "Flash firmware"}
      </button>

      {(state === "running" || state === "ok") && (
        <>
          <div className="progress"><div style={{ width: `${percent(step)}%` }} /></div>
          <div className="step">{step ? stepText(step) : "Starting…"}</div>
        </>
      )}

      {state === "ok" && (
        <div className="result ok">
          <b>Done — the dongle is ready.</b>
          Now pair the keyboard: hold the Naya's layer key (bottom-left) and press <b style={{ display: "inline" }}>1</b>, <b style={{ display: "inline" }}>2</b>, <b style={{ display: "inline" }}>3</b> or <b style={{ display: "inline" }}>4</b> to switch to a Bluetooth slot that isn't paired with another computer. The dongle picks it up from there.
        </div>
      )}
      {state === "error" && (
        <div className="result bad">
          <b>That didn't work.</b>
          {error}
        </div>
      )}

      <footer>
        <span>createflow Dongle {info?.version ?? ""}</span>
        <span>Firmware {info?.firmwareVersion ?? "…"}{info ? ` · ${Math.round(info.firmwareBytes / 1024)} KB` : ""}</span>
      </footer>
    </main>
  );
}
