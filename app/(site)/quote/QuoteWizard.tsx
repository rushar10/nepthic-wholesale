"use client";
import { useEffect, useState } from "react";
import { ActionForm, Submit } from "@/ui/Forms";
import { submitQuote } from "@/app/actions/quotes";

const KEY = "nepthic.quoteDraft.v1";
type Draft = { type: "QUOTE" | "ENQUIRY"; itemsText: string; estimatedUnits: string; neededBy: string; message: string };
const EMPTY: Draft = { type: "QUOTE", itemsText: "", estimatedUnits: "", neededBy: "", message: "" };
const STEPS = ["What you need", "Quantity and timing", "Details"];

/* Short steps with progress, and the draft is saved on this device as you type so
   nothing is lost if the page is closed. */
export function QuoteWizard({ business }: { business: string }) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && (saved.itemsText || saved.message)) { setD({ ...EMPTY, ...saved }); setRestored(true); }
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }, [d]);

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const enquiry = d.type === "ENQUIRY";
  const last = enquiry ? 1 : 2;

  const next = () => {
    if (step === 0 && !enquiry && d.itemsText.trim().length < 3) return setProblem("Tell us which styles and roughly how many.");
    setProblem("");
    setStep((s) => Math.min(last, s + 1));
  };

  return (
    <ActionForm action={submitQuote} className="panel prox" onDone={(s) => { if (s?.error) try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } }}>
      <div className="steps" aria-hidden="true">{(enquiry ? STEPS.filter((_, i) => i !== 1) : STEPS).map((_, i) => <span key={i} className={i <= (enquiry && step === 1 ? 1 : step) ? "on" : ""} />)}</div>
      <p className="small dim" aria-live="polite">Step {enquiry && step === 1 ? 2 : step + 1} of {last + 1} · {enquiry && step === 1 ? "Details" : STEPS[step]}</p>
      {restored && step === 0 && <p className="note">We restored your unsent draft. <button type="button" className="link" onClick={() => { setD(EMPTY); setRestored(false); }}>Start over</button></p>}

      <input type="hidden" name="type" value={d.type} />

      <div hidden={step !== 0} className="stack-sm">
        <div className="seg" role="radiogroup" aria-label="Request type">
          <label><input type="radio" name="_type" checked={!enquiry} onChange={() => setD({ ...d, type: "QUOTE" })} /> Quote request</label>
          <label><input type="radio" name="_type" checked={enquiry} onChange={() => setD({ ...d, type: "ENQUIRY" })} /> Question</label>
        </div>
        <label className="f">{enquiry ? "Topic (optional)" : "Styles and quantities"}
          <input type="text" name="itemsText" value={d.itemsText} onChange={set("itemsText")} enterKeyHint="next" autoCapitalize="sentences"
            placeholder={enquiry ? "e.g. Sale-or-return on caps" : "e.g. Drift Track Jacket ×80, Orbit Tee ×120 in black"} />
        </label>
      </div>

      {!enquiry && (
        <div hidden={step !== 1} className="form-grid">
          <label className="f">Estimated total units<input type="number" inputMode="numeric" name="estimatedUnits" min={0} value={d.estimatedUnits} onChange={set("estimatedUnits")} placeholder="200" /></label>
          <label className="f">Needed by<input type="date" name="neededBy" value={d.neededBy} onChange={set("neededBy")} /></label>
        </div>
      )}
      {enquiry && <><input type="hidden" name="estimatedUnits" value="" /><input type="hidden" name="neededBy" value="" /></>}

      <div hidden={step !== last} className="stack-sm">
        <label className="f">{enquiry ? "Your question" : "Details"}
          <textarea name="message" value={d.message} onChange={set("message")} rows={5} autoCapitalize="sentences"
            placeholder={enquiry ? "Ask us anything about wholesale." : "Custom labels, print placement, packaging, freight destination."} />
        </label>
        <dl className="kv">
          <div><dt>From</dt><dd>{business}</dd></div>
          {!enquiry && <div><dt>Request</dt><dd>{d.itemsText || "—"}</dd></div>}
          {!enquiry && d.estimatedUnits && <div><dt>Units</dt><dd className="mono">{d.estimatedUnits}</dd></div>}
        </dl>
      </div>

      {problem && <p className="note bad" role="alert">{problem}</p>}
      <div className="pinbar">
        {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>Back</button> : <span className="small dim">Draft saves as you type</span>}
        {step < last
          ? <button type="button" className="btn btn-primary prox" onClick={next}>Continue</button>
          : <span onClickCapture={() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }}><Submit pendingText="Sending…">Send to Nepthic</Submit></span>}
      </div>
    </ActionForm>
  );
}
