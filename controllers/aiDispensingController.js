const asyncHandler = require("express-async-handler");
const Anthropic = require("@anthropic-ai/sdk");
const User = require("../model/user");
const InteractionLog = require("../model/interactionLog");

// Requires ANTHROPIC_API_KEY in .env
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fast, cheap model for the live typing checks; stronger model for clinical chat.
const CHECK_MODEL = "claude-haiku-4-5";
const CHAT_MODEL = "claude-sonnet-4-6";

// ---------- helpers ----------

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const diff = Date.now() - new Date(dateOfBirth).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

// Build a compact patient-context object from the DB (source of truth)
const buildPatientContext = async (patientId) => {
  if (!patientId) return null;
  const patient = await User.findById(patientId).populate(
    "medications.medication",
    "nameOfDrugs dosage dosageForm"
  );
  if (!patient) return null;

  const currentMeds = (patient.medications || [])
    .filter((m) => m.current && m.medication)
    .map((m) => `${m.medication.nameOfDrugs} ${m.medication.dosage || ""}`.trim());

  return {
    age: calculateAge(patient.dateOfBirth),
    gender: patient.gender,
    currentMedications: currentMeds,
  };
};

// Strip markdown fences if the model wraps its JSON
const parseModelJSON = (text) => {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

// ---------- 1) Live interaction check (debounced typing trigger) ----------
// @route POST /api/ai/check-interaction
// body: { drugName, patientId?, basket: [{name, dosage}], sessionId?, hospitalId }
const checkInteraction = asyncHandler(async (req, res) => {
  const { drugName, patientId, basket = [], sessionId } = req.body;
  const hospitalId = req.body.hospitalId || req.hospitalId;

  if (!drugName || typeof drugName !== "string" || drugName.trim().length < 3) {
    return res.status(400).json({ message: "drugName (min 3 characters) is required." });
  }

  const patientContext = await buildPatientContext(patientId);

  // Everything the model needs, as structured context
  const contextBlock = {
    drugBeingAdded: drugName.trim(),
    currentBasket: basket.map((b) => `${b.name} ${b.dosage || ""}`.trim()),
    patient: patientContext || "No patient selected yet",
  };

  const systemPrompt = `You are a clinical drug-interaction screening assistant embedded in a hospital dispensing system used by licensed pharmacists in Nigeria.

Your job: assess the drug being added against the current basket and patient context, and classify severity.

Severity rules:
- "none": no meaningful interaction or concern.
- "minor": a real but not clinically dangerous interaction (e.g. mild absorption changes, spacing recommendations). These are logged silently and NOT shown to the pharmacist.
- "critical": clinically significant risk — dangerous drug-drug interactions, contraindications for this patient's age/conditions, duplicate therapy risks, or serious dosing concerns. Only these are surfaced.

Rules:
1. If the input does not look like a real drug name, return severity "none".
2. If uncertain whether something is minor or critical, choose "critical" — patient safety first.
3. The advisory must be ONE conversational sentence a pharmacist can act on, e.g. "Heads up: this combination increases bleeding risk; double-check if they are on thinners."
4. You support, never replace, the pharmacist's professional judgment.

Respond with ONLY a JSON object, no markdown, no preamble:
{"severity": "none" | "minor" | "critical", "advisory": "one sentence or empty string", "interactingWith": ["drug names from basket/patient meds involved, if any"]}`;

  try {
    const response = await anthropic.messages.create({
      model: CHECK_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(contextBlock) }],
    });

    const raw = response.content.find((c) => c.type === "text")?.text || "{}";
    let result;
    try {
      result = parseModelJSON(raw);
    } catch {
      // If the model returns malformed JSON, fail safe: don't block dispensing, don't fake an alert
      result = { severity: "none", advisory: "", interactingWith: [] };
    }

    const severity = ["none", "minor", "critical"].includes(result.severity)
      ? result.severity
      : "none";

    // Persist minor + critical checks for the audit trail (the "silent log")
    if (severity !== "none" && hospitalId) {
      InteractionLog.create({
        hospital: hospitalId,
        user: patientId || undefined,
        sessionId,
        drugChecked: drugName.trim(),
        basketSnapshot: basket,
        patientContext: patientContext
          ? { age: patientContext.age, gender: patientContext.gender }
          : undefined,
        severity,
        advisory: result.advisory || "",
        interactingWith: result.interactingWith || [],
        surfaced: severity === "critical",
      }).catch((err) => console.error("InteractionLog write failed:", err.message));
    }

    // The severity filter: minor issues return as "none" to the UI (logged above),
    // so the pharmacist only ever sees critical alerts.
    if (severity === "critical") {
      return res.status(200).json({
        severity: "critical",
        advisory: result.advisory,
        interactingWith: result.interactingWith || [],
      });
    }

    return res.status(200).json({ severity: "none", advisory: "", interactingWith: [] });
  } catch (error) {
    console.error("AI interaction check failed:", error.message);
    // Never block the dispensing workflow because the AI is down
    return res.status(200).json({
      severity: "none",
      advisory: "",
      interactingWith: [],
      aiUnavailable: true,
    });
  }
});

// ---------- 2) Sidebar clinical chat (session-context aware) ----------
// @route POST /api/ai/chat
// body: { question, patientId?, basket: [{name, dosage}], history: [{role, content}] }
const dispensingChat = asyncHandler(async (req, res) => {
  const { question, patientId, basket = [], history = [] } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ message: "question is required." });
  }

  const patientContext = await buildPatientContext(patientId);

  const systemPrompt = `You are a clinical assistant embedded in a hospital dispensing workspace, chatting with a licensed pharmacist while they dispense medication.

CURRENT SESSION CONTEXT (live, from the dispensing workspace):
- Active dispensing basket: ${
    basket.length
      ? basket.map((b) => `${b.name} ${b.dosage || ""}`.trim()).join(", ")
      : "empty"
  }
- Patient: ${
    patientContext
      ? `age ${patientContext.age ?? "unknown"}, ${patientContext.gender || "gender unknown"}, current medications: ${
          patientContext.currentMedications.length
            ? patientContext.currentMedications.join(", ")
            : "none on record"
        }`
      : "no patient selected"
  }

Guidelines:
- Answer clinical questions directly and concisely (2-5 sentences unless more detail is asked for). You are talking to a professional — no long disclaimers.
- Use the session context: when they say "this" or "these drugs", they mean the basket above.
- Be specific about mechanisms, monitoring, and dose adjustments where relevant.
- If a question needs information you don't have (labs, full history), say exactly what to check.
- If genuinely uncertain, say so plainly rather than guessing. You support, never replace, the pharmacist's judgment.`;

  // Keep only the last 12 turns to bound token usage
  const trimmedHistory = history.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages: [...trimmedHistory, { role: "user", content: question.trim() }],
    });

    const answer = response.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    res.status(200).json({ answer });
  } catch (error) {
    console.error("AI chat failed:", error.message);
    res.status(502).json({
      message: "The clinical assistant is temporarily unavailable. Please rely on your standard references.",
    });
  }
});

// ---------- 3) Review the silent log ----------
// @route GET /api/ai/interaction-logs/:hospitalId?severity=minor
const getInteractionLogs = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const { severity, sessionId } = req.query;

  const filter = { hospital: hospitalId };
  if (severity) filter.severity = severity;
  if (sessionId) filter.sessionId = sessionId;

  const logs = await InteractionLog.find(filter)
    .populate("user", "fullName")
    .sort({ createdAt: -1 })
    .limit(200);

  res.status(200).json({ logs });
});

module.exports = { checkInteraction, dispensingChat, getInteractionLogs };