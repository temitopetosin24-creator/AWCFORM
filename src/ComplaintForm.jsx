import { useState, useMemo } from "react";
import axios from "axios";

// Paste your Apps Script Web App URL here.
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzcMCHIZqqw7z-5P5RqMh0S4DjLJfcUfmpmnnKiDcjnBL5JSDNNbXRt6W043fcvSh2vuw/exec";

const COMPLAINT_TYPES = [
  "Workplace Environment / Facilities",
  "Office Accommodation",
  "Cleaning / Sanitation",
  "Stationary",
  "Security",
  "Transport",
  "Catering / Meals",
  "Power / Electricity",
  "Water Supply",
  "Vendor / Contractor Issue",
  "Others",
];
const LOCATION_TYPES = ["BU", "UT", "Injection"];
const CONTACT_METHODS = ["Email", "Phone call", "WhatsApp", "SMS"];
const MAX_FILES = 5;
const MAX_MB = 5;

const STEPS = [
  { title: "About you", hint: "Who is reporting" },
  { title: "The complaint", hint: "What happened and where" },
  { title: "In your words", hint: "Describe it and its impact" },
  { title: "Earlier reports", hint: "Anything already raised" },
  { title: "Resolution", hint: "Evidence and confirmation" },
];

const initial = {
  fullName: "", staffId: "", locationType: "BU", locationName: "", department: "",
  email: "", phone: "", contactMethod: "Email",
  complaintType: "", dateOccurred: "", incidentLocation: "", involved: "",
  description: "", impact: "",
  previouslyReported: "", reportedTo: "", responseTaken: "",
  expectedOutcome: "", hasEvidence: "", files: [], confirmed: false,
};

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const phoneOk = (v) => v.replace(/\D/g, "").length >= 10;

function validate(step, f) {
  const e = {};
  if (step === 0) {
    if (!f.fullName.trim()) e.fullName = "Enter your full name";
    if (!f.staffId.trim()) e.staffId = "Enter your staff ID";
    if (!f.locationName.trim()) e.locationName = "Enter the " + f.locationType + " name";
    if (!f.department.trim()) e.department = "Enter your department";
    if (!emailOk(f.email)) e.email = "Enter a valid official email";
    if (!phoneOk(f.phone)) e.phone = "Enter a valid phone number";
  }
  if (step === 1) {
    if (!f.complaintType) e.complaintType = "Select a complaint type";
    if (!f.dateOccurred) e.dateOccurred = "Select the date it happened";
    if (!f.incidentLocation.trim()) e.incidentLocation = "Say where it happened";
    if (!f.involved.trim()) e.involved = "Say who or what is involved";
  }
  if (step === 2) {
    if (f.description.trim().length < 30) e.description = "Add more detail (at least 30 characters)";
    if (!f.impact.trim()) e.impact = "Tell us how this affected you";
  }
  if (step === 3) {
    if (!f.previouslyReported) e.previouslyReported = "Choose Yes or No";
    if (f.previouslyReported === "Yes") {
      if (!f.reportedTo.trim()) e.reportedTo = "Say who you reported it to and when";
      if (!f.responseTaken.trim()) e.responseTaken = "Say what response you received";
    }
  }
  if (step === 4) {
    if (!f.expectedOutcome.trim()) e.expectedOutcome = "Tell us what outcome you expect";
    if (!f.hasEvidence) e.hasEvidence = "Choose Yes or No";
    if (f.hasEvidence === "Yes" && f.files.length === 0) e.files = "Upload at least one file";
    if (!f.confirmed) e.confirmed = "Confirm before you submit";
  }
  return e;
}

const toBase64 = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("Could not read " + file.name));
    r.readAsDataURL(file);
  });

function Field({ label, error, hint, children, id }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

function Choice({ options, value, onChange, label }) {
  return (
    <div className="choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button" key={o} role="radio" aria-checked={value === o}
          className={value === o ? "on" : ""} onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export default function ComplaintForm() {
  const [f, setF] = useState(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [ref, setRef] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setVal = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  const next = () => {
    const e = validate(step, f);
    setErrors(e);
    if (Object.keys(e).length === 0) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const back = () => {
    setErrors({});
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addFiles = (list) => {
    const incoming = Array.from(list);
    const problems = [];
    const accepted = [];
    incoming.forEach((file) => {
      if (file.size > MAX_MB * 1024 * 1024) problems.push(file.name + " is over " + MAX_MB + " MB");
      else accepted.push(file);
    });
    const merged = [...f.files, ...accepted].slice(0, MAX_FILES);
    if (f.files.length + accepted.length > MAX_FILES) problems.push("Only " + MAX_FILES + " files allowed");
    setF((p) => ({ ...p, files: merged }));
    setErrors((p) => ({ ...p, files: problems.join(". ") || undefined }));
  };
  const removeFile = (i) => setF((p) => ({ ...p, files: p.files.filter((_, x) => x !== i) }));

  const submit = async () => {
    const e = validate(4, f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStatus("sending");
    setErrMsg("");
    const reference = "CMP-" + Date.now().toString(36).toUpperCase();
    try {
      // Convert files to base64 objects for Google Drive upload
      const files = f.hasEvidence === "Yes"
        ? await Promise.all(f.files.map(async (file) => ({
            name: file.name,
            type: file.type,
            data: await toBase64(file),
          })))
        : [];

      const payload = {
        reference,
        submittedAt: new Date().toISOString(),
        fullName: f.fullName,
        staffId: f.staffId,
        location: f.locationType + " - " + f.locationName,
        department: f.department,
        email: f.email,
        phone: f.phone,
        contactMethod: f.contactMethod,
        complaintType: f.complaintType,
        dateOccurred: f.dateOccurred,
        incidentLocation: f.incidentLocation,
        involved: f.involved,
        description: f.description,
        impact: f.impact,
        previouslyReported: f.previouslyReported,
        reportedTo: f.previouslyReported === "Yes" ? f.reportedTo : "",
        responseTaken: f.previouslyReported === "Yes" ? f.responseTaken : "",
        expectedOutcome: f.expectedOutcome,
        hasEvidence: f.hasEvidence,
        files
      };

      if (SCRIPT_URL) {
        const response = await axios.post(SCRIPT_URL, JSON.stringify(payload), {
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
        let result = response.data;
        if (typeof result === "string") {
          try {
            result = JSON.parse(result);
          } catch {
            throw new Error("The Apps Script returned an unreadable response.");
          }
        }
        if (!result || result.ok !== true) {
          throw new Error(
            result?.error ||
            result?.message ||
            "The Apps Script did not confirm the submission."
          );
        }
        setRef(result.reference || reference);
      } else {
        throw new Error("The Apps Script URL is not configured.");
      }
      setStatus("done");
    } catch (err) {
      console.error("Submit error:", err);
      setErrMsg(err instanceof Error ? err.message : String(err));
      setStatus("failed");
    }
  };

  const reset = () => { setF(initial); setStep(0); setErrors({}); setStatus("idle"); setErrMsg(""); };

  return (
    <div className="page">
      <style>{css}</style>
      <div className="shell">
        <header className="top">
          <div className="brand">
            <span className="bolt" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor" /></svg>
            </span>
            <div className="brand-text">
              <p className="org">Ikeja Electric</p>
              <h1 className="title">Staff complaint form</h1>
            </div>
          </div>
          {status !== "done" && (
            <div className="prog" aria-label={"Step " + (step + 1) + " of " + STEPS.length}>
              <div className="bar"><span style={{ width: progress + "%" }} /></div>
              <p><strong className="step-title">{STEPS[step].title}</strong> <span className="step-count">Step {step + 1} of {STEPS.length}</span></p>
            </div>
          )}
        </header>

        {status === "done" ? (
          <main className="card done">
            <div className="tick" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="done-title">Complaint submitted</h2>
            <p className="done-text">
              {ref ? "Keep this reference number. You can quote it when you follow up." : "Your complaint was received successfully."}
            </p>
            {ref && <div className="refno">{ref}</div>}
            <p className="small">We will contact you by {f.contactMethod.toLowerCase()} at the details you gave.</p>
            <button className="btn primary" onClick={reset}>Submit another complaint</button>
          </main>
        ) : (
          <main className="card">
            {step === 0 && (
              <>
                <Field id="fullName" label="Full name" error={errors.fullName}>
                  <input id="fullName" autoComplete="name" value={f.fullName} onChange={set("fullName")} placeholder="Surname and first name" />
                </Field>
                <Field id="staffId" label="Staff ID" error={errors.staffId}>
                  <input id="staffId" value={f.staffId} onChange={set("staffId")} placeholder="e.g. IKD012345" />
                </Field>
                <Field label="Location type" id="locType">
                  <Choice label="Location type" options={LOCATION_TYPES} value={f.locationType} onChange={setVal("locationType")} />
                </Field>
                <Field id="locationName" label={f.locationType + " name"} error={errors.locationName}>
                  <input id="locationName" value={f.locationName} onChange={set("locationName")} placeholder={f.locationType === "BU" ? "e.g. Akowonjo BU" : f.locationType === "UT" ? "e.g. Magodo UT" : "e.g. Ope Ilu Injection Substation"} />
                </Field>
                <Field id="department" label="Department" error={errors.department}>
                  <input id="department" value={f.department} onChange={set("department")} placeholder="Your department" />
                </Field>
                <Field id="email" label="Official email address" error={errors.email}>
                  <input id="email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set("email")} placeholder="name@ikejaelectric.com" />
                </Field>
                <Field id="phone" label="Phone number" error={errors.phone}>
                  <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="0801 234 5678" />
                </Field>
                <Field label="Preferred way to reach you" id="contact">
                  <Choice label="Preferred contact method" options={CONTACT_METHODS} value={f.contactMethod} onChange={setVal("contactMethod")} />
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field id="complaintType" label="What type of complaint are you reporting?" error={errors.complaintType}>
                  <select id="complaintType" value={f.complaintType} onChange={set("complaintType")}>
                    <option value="">Select a type</option>
                    {COMPLAINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field id="dateOccurred" label="Date of occurrence" error={errors.dateOccurred}>
                  <input id="dateOccurred" type="date" max={new Date().toISOString().split("T")[0]} value={f.dateOccurred} onChange={set("dateOccurred")} />
                </Field>
                <Field id="incidentLocation" label="Where did it happen?" error={errors.incidentLocation}>
                  <input id="incidentLocation" value={f.incidentLocation} onChange={set("incidentLocation")} placeholder="Office, feeder, vehicle, site..." />
                </Field>
                <Field id="involved" label="Who or what is involved?" error={errors.involved} hint="Names, roles, equipment or units.">
                  <textarea id="involved" rows={3} value={f.involved} onChange={set("involved")} />
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field id="description" label="Describe the complaint in detail" error={errors.description} hint={f.description.length + " characters. Say what happened, when and in what order."}>
                  <textarea id="description" rows={7} value={f.description} onChange={set("description")} />
                </Field>
                <Field id="impact" label="How has this affected you or your work?" error={errors.impact}>
                  <textarea id="impact" rows={4} value={f.impact} onChange={set("impact")} />
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <Field label="Have you reported this before?" id="prev" error={errors.previouslyReported}>
                  <Choice label="Previously reported" options={["Yes", "No"]} value={f.previouslyReported} onChange={setVal("previouslyReported")} />
                </Field>
                {f.previouslyReported === "Yes" ? (
                  <>
                    <Field id="reportedTo" label="Who did you report it to, and when?" error={errors.reportedTo}>
                      <textarea id="reportedTo" rows={3} value={f.reportedTo} onChange={set("reportedTo")} />
                    </Field>
                    <Field id="responseTaken" label="What response or action was taken?" error={errors.responseTaken}>
                      <textarea id="responseTaken" rows={3} value={f.responseTaken} onChange={set("responseTaken")} />
                    </Field>
                  </>
                ) : f.previouslyReported === "No" ? (
                  <p className="note">No earlier report. You can continue to the next step.</p>
                ) : null}
              </>
            )}

            {step === 4 && (
              <>
                <Field id="expectedOutcome" label="What outcome or resolution do you expect?" error={errors.expectedOutcome}>
                  <textarea id="expectedOutcome" rows={4} value={f.expectedOutcome} onChange={set("expectedOutcome")} />
                </Field>
                <Field label="Do you have supporting evidence?" id="ev" error={errors.hasEvidence}>
                  <Choice label="Has evidence" options={["Yes", "No"]} value={f.hasEvidence} onChange={setVal("hasEvidence")} />
                </Field>

                {f.hasEvidence === "Yes" && (
                  <Field id="files" label="Upload documents, photos or screenshots" error={errors.files} hint={"Up to " + MAX_FILES + " files, " + MAX_MB + " MB each."}>
                    <label className="drop" htmlFor="files">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 15v4h14v-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>Tap to choose files</span>
                    </label>
                    <input id="files" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} hidden />
                    {f.files.length > 0 && (
                      <ul className="files">
                        {f.files.map((file, i) => (
                          <li key={file.name + i}>
                            <span className="fn">{file.name}</span>
                            <span className="fs">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                            <button type="button" aria-label={"Remove " + file.name} onClick={() => removeFile(i)}>×</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Field>
                )}

                <div className="field">
                  <label className="check">
                    <input type="checkbox" checked={f.confirmed} onChange={(e) => setVal("confirmed")(e.target.checked)} />
                    <span>I confirm that the information I have given is true and complete to the best of my knowledge.</span>
                  </label>
                  {errors.confirmed && <p className="err" role="alert">{errors.confirmed}</p>}
                </div>
                {status === "failed" && <p className="err" role="alert">Submission failed: {errMsg}</p>}
              </>
            )}
          </main>
        )}

        {status !== "done" && (
          <footer className="nav">
            {step > 0 && <button className="btn ghost" onClick={back} disabled={status === "sending"}>Back</button>}
            {step < STEPS.length - 1 ? (
              <button className="btn primary" onClick={next}>Continue</button>
            ) : (
              <button className="btn primary" onClick={submit} disabled={status === "sending"}>
                {status === "sending" ? "Submitting..." : "Submit complaint"}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
.page{min-height:100vh;background:#EEF1F6;font-family:'Figtree',system-ui,sans-serif;color:#14213D;display:flex;justify-content:center}
.shell{width:100%;max-width:430px;min-height:100vh;background:#F6F8FB;display:flex;flex-direction:column;position:relative}
.top{background:#0F1B2D;color:#fff;padding:20px 18px 18px;border-radius:0 0 22px 22px}
.brand{display:flex;gap:12px;align-items:center}
.bolt{width:38px;height:38px;border-radius:11px;background:#F5C518;color:#0F1B2D;display:grid;place-items:center;flex:none}
.org{margin:0;font-size:12px;color:#9FB0CC;font-weight:500}
.title{margin:2px 0 0;font-size:19px;font-weight:700;letter-spacing:-.01em}
.prog{margin-top:18px}
.bar{height:6px;background:#22314A;border-radius:99px;overflow:hidden}
.bar span{display:block;height:100%;background:#F5C518;border-radius:99px;transition:width .3s ease}
.prog p{margin:10px 0 0;display:flex;justify-content:space-between;font-size:14px}
.step-title{font-weight:600}
.step-count{color:#9FB0CC}
.card{margin:16px 14px 0;background:#fff;border-radius:18px;padding:18px 16px 8px;box-shadow:0 1px 2px rgba(15,27,45,.06),0 6px 20px rgba(15,27,45,.05);flex:0 0 auto}
.field{margin-bottom:18px}
label{display:block;font-size:14px;font-weight:600;margin-bottom:7px}
input,select,textarea{width:100%;font:inherit;font-size:16px;color:#14213D;background:#F6F8FB;border:1.5px solid #D8DFEA;border-radius:12px;padding:13px 14px;outline:none;transition:border-color .15s,box-shadow .15s;appearance:none;-webkit-appearance:none}
select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2314213D' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:38px}
textarea{resize:vertical;line-height:1.45}
input:focus,select:focus,textarea:focus{border-color:#2F6BFF;box-shadow:0 0 0 3px rgba(47,107,255,.18);background:#fff}
input::placeholder,textarea::placeholder{color:#8D99AE}
.hint{margin:6px 2px 0;font-size:12.5px;color:#66738A}
.err{margin:6px 2px 0;font-size:13px;color:#C62828;font-weight:500}
.choice{display:flex;flex-wrap:wrap;gap:8px}
.choice button{flex:1 1 auto;min-width:72px;font:inherit;font-size:15px;font-weight:600;padding:11px 14px;border-radius:12px;border:1.5px solid #D8DFEA;background:#F6F8FB;color:#14213D;cursor:pointer}
.choice button.on{background:#0F1B2D;border-color:#0F1B2D;color:#fff}
.note{background:#EAF1FF;color:#1B3F99;border-radius:12px;padding:12px 14px;font-size:14px;margin:0 0 18px}
.drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 12px;border:2px dashed #B7C3D8;border-radius:14px;color:#2F6BFF;font-weight:600;font-size:15px;background:#F6F8FB;cursor:pointer;margin:0}
.files{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:8px}
.files li{display:flex;align-items:center;gap:10px;background:#F6F8FB;border:1px solid #E1E7F0;border-radius:12px;padding:10px 12px}
.fn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500}
.fs{font-size:12px;color:#66738A}
.files button{border:0;background:#E7ECF4;width:28px;height:28px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer;color:#14213D}
.check{display:flex;gap:12px;align-items:flex-start;font-weight:500;line-height:1.45;margin:0;cursor:pointer;background:#F6F8FB;border-radius:12px;padding:14px}
.check input{width:22px;height:22px;flex:none;margin:0;padding:0;appearance:auto;-webkit-appearance:checkbox;accent-color:#0F1B2D}
.nav{position:sticky;bottom:0;margin-top:auto;display:flex;gap:10px;padding:14px 14px calc(14px + env(safe-area-inset-bottom,0px));background:linear-gradient(to top,#F6F8FB 70%,rgba(246,248,251,0))}
.btn{font:inherit;font-size:16px;font-weight:700;border-radius:14px;padding:15px 18px;border:0;cursor:pointer}
.btn.primary{flex:1;background:#0F1B2D;color:#fff}
.btn.ghost{background:#fff;color:#14213D;border:1.5px solid #D8DFEA}
.btn:disabled{opacity:.6;cursor:default}
.btn:focus-visible{outline:3px solid rgba(47,107,255,.5);outline-offset:2px}
.done{text-align:center;padding:28px 18px 22px}
.done h2{margin:12px 0 6px;font-size:21px}
.done p{margin:0 0 14px;color:#4A576D;font-size:15px;line-height:1.5}
.done .small{font-size:13.5px}
.tick{width:60px;height:60px;border-radius:50%;background:#E3F6EA;color:#1E8E4E;display:grid;place-items:center;margin:0 auto}
.refno{font-weight:700;font-size:22px;letter-spacing:.04em;background:#F6F8FB;border:1.5px dashed #B7C3D8;border-radius:12px;padding:14px;margin:4px 0 14px}
.done .btn{width:100%;margin-top:6px}
@media (min-width:431px){.shell{box-shadow:0 0 0 1px #DDE3EC;min-height:100vh}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
