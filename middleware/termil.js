const axios = require("axios");

// Termii SMS sender — credentials now come from environment variables.
// Required in .env:
//   TERMII_API_KEY=your_termii_api_key
//   TERMII_SENDER_ID=your_approved_sender_id (falls back to "N-Alert")
const sendMedicationReminder = async (userPhoneNumber, userName, medicationName, dosage, dosageForm) => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID || "N-Alert";
  const baseURL = "https://v3.api.termii.com/api/sms/send";

  if (!apiKey) {
    console.error("TERMII_API_KEY is not set — skipping SMS reminder.");
    return { success: false, reason: "missing_api_key" };
  }

  const message = `Reminder: Hi ${userName}, it's time to take your ${medicationName} (${dosage} ${dosageForm}). Stay on track for your health! If you've already taken it, please disregard this message. - HealthTrack`;

  try {
    const response = await axios.post(baseURL, {
      to: userPhoneNumber,
      from: senderId,
      sms: message,
      type: "plain",
      channel: "generic",
      api_key: apiKey,
    });

    if (response.data.success || response.data.code === "ok") {
      console.log("SMS sent successfully!");
      return { success: true, data: response.data };
    }
    console.log("Failed to send SMS:", response.data);
    return { success: false, data: response.data };
  } catch (error) {
    console.error("Error sending SMS:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = sendMedicationReminder;
