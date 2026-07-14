const asyncHandler = require("express-async-handler");
const Anthropic = require("@anthropic-ai/sdk");
const User = require("../model/user");
const InteractionLog = require("../model/interactionLog");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    "nameOfDrugs dosage dosageForm",
  );
  if (!patient) return null;

  const currentMeds = (patient.medications || [])
    .filter((m) => m.current && m.medication)
    .map((m) =>
      `${m.medication.nameOfDrugs} ${m.medication.dosage || ""}`.trim(),
    );

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
// Returns compact one-line alerts: drug(s) → problem → reason → suggestion.
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

  const systemPrompt = `You are a clinical drug therapy screening assistant in a Nigerian hospital dispensing system.

You receive the FULL dispensing basket plus patient context. Analyse for:
1. Drug-drug interactions (any pair in the basket)
2. Drug-patient contraindications (age, gender, existing medications on record)
3. Duplicate therapy (same therapeutic class)
4. Dosage concerns for this patient profile

Severity:
- "minor": real but not clinically dangerous. Logged silently, NOT shown.
- "critical": clinically significant risk. Must be shown.
When uncertain, choose critical.

FORMAT — this is critical. Each alert must be ONE short punchy sentence that follows this exact pattern:
"[Drug A + Drug B] — [what's wrong] because [why]. [What to do instead]."

Examples of GOOD alerts:
- "Warfarin + Ibuprofen — increases bleeding risk due to platelet inhibition and protein displacement. Use paracetamol instead."
- "Ibuprofen — high GI bleed risk in patients over 70. Consider topical NSAID or paracetamol."
- "Lisinopril + Spironolactone — risk of dangerous hyperkalemia from dual potassium retention. Monitor potassium closely or avoid combination."

Rules:
1. Maximum 5 alerts. Only the most important ones.
2. Each alert is ONE sentence. No headers, no bullet points, no paragraphs. Straight to the point.
3. State the drugs, the problem, why, and what to do — nothing else.
4. If no problems exist, return empty alerts array.

Respond ONLY with JSON, no markdown:
{"alerts": [{"severity": "minor"|"critical", "drugs": ["DrugA", "DrugB"], "line": "The one-sentence alert."}]}
If clean: {"alerts": []}`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 600,
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
          (a) =>
            a.severity &&
            a.line &&
            Array.isArray(a.drugs) &&
            a.drugs.length > 0,
        )
      : [];

    // Persist all for audit
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
        advisory: alert.line,
        interactingWith: alert.drugs,
        surfaced: alert.severity === "critical",
      }).catch((err) =>
        console.error("InteractionLog write failed:", err.message),
      );
    }

    // Only surface critical
    const criticalAlerts = alerts.filter((a) => a.severity === "critical");
    return res.status(200).json({ alerts: criticalAlerts });
  } catch (error) {
    console.error("AI basket check failed:", error.message);
    return res.status(200).json({ alerts: [], aiUnavailable: true });
  }
});

// ---------- 2) Sidebar clinical chat ----------
const dispensingChat = asyncHandler(async (req, res) => {
  const { question, patientId, basket = [], history = [] } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ message: "question is required." });
  }

  const patientContext = await buildPatientContext(patientId);

  const systemPrompt = `You are a clinical assistant embedded in a hospital dispensing workspace, chatting with a licensed pharmacist.

CURRENT SESSION CONTEXT (live):
- Dispensing basket: ${
    basket.length
      ? basket.map((b) => `${b.name} ${b.dosage || ""}`.trim()).join(", ")
      : "empty"
  }
- Patient: ${
    patientContext
      ? `age ${patientContext.age ?? "unknown"}, ${patientContext.gender || "gender unknown"}, medications on record: ${
          patientContext.currentMedications.length
            ? patientContext.currentMedications.join(", ")
            : "none"
        }`
      : "no patient selected"
  }

Guidelines:
- Answer clinical questions directly and concisely. You are talking to a professional.
- Use the session context: "this" or "these drugs" means the basket above.
- Be specific about mechanisms, monitoring, and dose adjustments.
- If asked to elaborate on a warning, provide: mechanism, specific risk, monitoring, and safer alternatives.
- Use markdown formatting: headers, bold, lists, tables where helpful.
- If uncertain, say so. You support, never replace, the pharmacist's judgment.`;

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
      message: "The clinical assistant is temporarily unavailable.",
    });
  }
});

// ---------- 3) Interaction logs ----------
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
