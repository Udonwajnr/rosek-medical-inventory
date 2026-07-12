const asyncHandler = require("express-async-handler");
const Anthropic = require("@anthropic-ai/sdk");
const User = require("../model/user");
const InteractionLog = require("../model/interactionLog");

// Requires ANTHROPIC_API_KEY in .env
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sonnet for both endpoints — basket analysis needs clinical depth, not just speed
const AI_MODEL = "claude-sonnet-4-6";

// ---------- helpers ----------

const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const diff = Date.now() - new Date(dateOfBirth).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
};

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
    conditions: [],
    currentMedications: currentMeds,
  };
};

const parseModelJSON = (text) => {
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
};

// ---------- 1) Full basket analysis ----------
// @route POST /api/ai/check-basket
// Called each time a drug is added to or removed from the basket.
// Analyses ALL drugs in the basket against each other AND against the patient.
// Returns an array of alerts — each with a 2-line summary.
//
// body: { basket: [{name, dosage}], patientId?, sessionId?, hospitalId }
const checkBasket = asyncHandler(async (req, res) => {
  const { basket = [], patientId, sessionId } = req.body;
  const hospitalId = req.body.hospitalId || req.hospitalId;

  if (!Array.isArray(basket) || basket.length === 0) {
    return res.status(200).json({ alerts: [] });
  }

  const patientContext = await buildPatientContext(patientId);

  const contextBlock = {
    dispensingBasket: basket.map((b) => `${b.name} ${b.dosage || ""}`.trim()),
    patient: patientContext || "No patient selected yet",
  };

  const systemPrompt = `You are a clinical drug therapy screening assistant embedded in a hospital dispensing system used by licensed pharmacists in Nigeria.

You receive the FULL dispensing basket (all drugs the pharmacist intends to dispense together) plus available patient context.

Your job: analyse the basket comprehensively and identify ALL clinically relevant problems. Check for:
1. **Drug-drug interactions** — between ANY pair of drugs in the basket.
2. **Drug-patient contraindications** — any drug inappropriate for this patient's age, gender, or known conditions/medications on record.
3. **Duplicate therapy** — two drugs from the same therapeutic class dispensed together without clear justification.
4. **Dosage concerns** — where the dosage in the basket is unusual for the patient profile.
5. **Any other drug therapy problem** a pharmacist should catch at the dispensing counter.

Severity rules:
- "minor": real but not clinically dangerous (mild absorption changes, spacing recommendations). These are logged silently.
- "critical": clinically significant risk — the pharmacist MUST be alerted. When uncertain between minor and critical, choose critical.

For each problem found, produce an alert object with:
- "severity": "minor" or "critical"
- "type": one of "interaction", "contraindication", "duplicate_therapy", "dosage_concern", "other"
- "drugs": array of drug names from the basket involved in this alert
- "summary": EXACTLY 2 short sentences. First sentence: what the problem is. Second sentence: the clinical consequence or what to check. Be direct, no fluff.
  Example: "Warfarin and Ibuprofen interact significantly. This combination increases bleeding risk — verify INR and consider paracetamol instead."

Rules:
1. If the basket contains only one drug and no patient context issues, return an empty alerts array.
2. Return ALL problems you find, not just the first one.
3. Do NOT return alerts for non-issues — no alert is better than a false alert.
4. You support, never replace, the pharmacist's professional judgment.

Respond with ONLY a JSON object, no markdown, no preamble:
{"alerts": [{"severity": "minor"|"critical", "type": "...", "drugs": ["..."], "summary": "Two sentences."}]}
If no problems: {"alerts": []}`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(contextBlock) }],
    });

    const raw = response.content.find((c) => c.type === "text")?.text || "{}";
    let result;
    try {
      result = parseModelJSON(raw);
    } catch {
      result = { alerts: [] };
    }

    const alerts = Array.isArray(result.alerts)
      ? result.alerts.filter(
          (a) => a.severity && a.summary && Array.isArray(a.drugs) && a.drugs.length > 0
        )
      : [];

    // Persist all alerts for the audit trail
    for (const alert of alerts) {
      InteractionLog.create({
        hospital: hospitalId,
        user: patientId || undefined,
        sessionId,
        drugChecked: alert.drugs.join(" + "),
        basketSnapshot: basket,
        patientContext: patientContext
          ? { age: patientContext.age, gender: patientContext.gender }
          : undefined,
        severity: alert.severity,
        advisory: alert.summary,
        interactingWith: alert.drugs,
        surfaced: alert.severity === "critical",
      }).catch((err) => console.error("InteractionLog write failed:", err.message));
    }

    // Only return critical alerts to the UI; minor ones are logged silently
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");

    return res.status(200).json({ alerts: criticalAlerts });
  } catch (error) {
    console.error("AI basket check failed:", error.message);
    return res.status(200).json({ alerts: [], aiUnavailable: true });
  }
});

// ---------- 2) Sidebar clinical chat ----------
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
      ? `age ${patientContext.age ?? "unknown"}, ${patientContext.gender || "gender unknown"}, current medications on record: ${
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
- If asked to elaborate on a specific drug therapy warning, provide:
  1. The clinical mechanism behind the interaction/problem
  2. The specific risk (what could happen)
  3. Monitoring recommendations or safer alternatives
  4. Any patient-specific considerations based on the context above
- If genuinely uncertain, say so plainly rather than guessing. You support, never replace, the pharmacist's judgment.`;

  const trimmedHistory = history.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 800,
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
      message:
        "The clinical assistant is temporarily unavailable. Please rely on your standard references.",
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

module.exports = { checkBasket, dispensingChat, getInteractionLogs };