const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");

exports.generateComplaint = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const { reportData, photoBase64 } = request.data;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  try {
    // IMPROVED PROMPT - Generates concise, accurate letters with exact user description
    const prompt = `You are drafting a formal complaint letter to municipal authorities in India on behalf of a citizen reporter.

REPORT DETAILS:
- Incident Type: ${reportData.incidentType}
- Location: ${reportData.locationName || "the reported location"}
- Reporter Name: ${reportData.reporterName}
- User's Description: "${reportData.description}"

STRICT REQUIREMENTS:
1. Keep the letter CONCISE - Maximum 120-150 words total
2. MUST include a "Subject:" line at the top
3. In the main body, you MUST quote the user's exact description verbatim using quotation marks
   Example: The reporter states: "${reportData.description}"
4. DO NOT paraphrase or expand the user's description - use their EXACT words
5. Keep it professional but brief - authorities are busy
6. Structure:
   - Subject: [Brief subject line based on incident type]
   - Salutation: "To the Municipal Commissioner/Concerned Authority,"
   - Body: 2-3 short paragraphs maximum
     * Paragraph 1: State the issue and location briefly
     * Paragraph 2: Quote the user's EXACT description
     * Paragraph 3: Request for action
   - Closing: "Sincerely, [Reporter Name] (via City Sense Platform)"
7. ${photoBase64 ? 'IMPORTANT: Add at the very end: "Photographic evidence is attached for your reference."' : ''}
8. Use formal but direct Indian English tone
9. If the description contains Hinglish or regional language, translate it to formal English but keep the meaning exact

OUTPUT ONLY THE LETTER TEXT - No preamble, no explanations.`;

    const contents = [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    // Attach photo if provided (for AI to analyze)
    if (photoBase64) {
      contents[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: photoBase64,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
    });

    return {
      success: true,
      complaintLetter: response.text,
    };
  } catch (err) {
    console.error("Gemini Backend Error:", err);
    throw new HttpsError(
      "internal",
      "AI failed to generate the letter. Please try again."
    );
  }
});