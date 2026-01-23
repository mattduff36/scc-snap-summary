import { NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
} from "@google/generative-ai";

const MODEL_CANDIDATES = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro",
];

const isApiKeyError = (error: unknown) =>
  error instanceof Error && error.message.toLowerCase().includes("api key");

const isModelUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const modelHints = [
    "model",
    "models/",
    "not found",
    "not supported",
    "unknown model",
    "overloaded",
  ];

  if (modelHints.some((hint) => message.includes(hint))) {
    return true;
  }

  return error instanceof GoogleGenerativeAIFetchError && error.status === 404;
};

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "API key is not configured. Please set GOOGLE_API_KEY in your environment variables." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const { text } = await request.json();
    
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const prompt = `Summarize the following text into 1-4 short sentences. Follow these specific rules:

1. The first 5-6 words are crucial and should be direct and action-oriented, avoiding words like 'regarding', 'concerning', or 'about'.
2. If the text contains a delivery or tracking number, ALWAYS start with that number (e.g., "02167500003781 - part shipped to locker").
3. If the text contains an FSI number (FSIxxxxxxx), do NOT include it in the first 6 words. It can be mentioned later in the summary if relevant.
4. Start with the most important action or subject.
5. Include any other reference numbers or key identifiers.

Example formats:
- For tracking numbers: "02167500003781 - part shipped to locker" followed by the rest of the summary.
- For other cases: "Engineer visit scheduling: FSI0252801" followed by the rest of the summary.

Text to summarize:
${text}`;

    let lastError: unknown;

    for (const modelName of MODEL_CANDIDATES) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 100,
          },
        });

        const response = await result.response;
        const summary = response.text() || "No summary returned.";
        return NextResponse.json({ summary });
      } catch (error) {
        lastError = error;

        if (isApiKeyError(error)) {
          return NextResponse.json(
            { error: "Invalid API key. Please check your GOOGLE_API_KEY configuration." },
            { status: 401 }
          );
        }

        if (!isModelUnavailableError(error)) {
          console.error("Gemini API Error:", error);
          return NextResponse.json(
            { error: "Failed to summarize. Please try again later." },
            { status: 500 }
          );
        }

        console.warn(`Gemini model "${modelName}" unavailable, trying fallback.`);
      }
    }

    console.error("Gemini API Error:", lastError);
    return NextResponse.json(
      {
        error:
          "Model configuration error. None of the configured models are available.",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: "Invalid API key. Please check your GOOGLE_API_KEY configuration." },
          { status: 401 }
        );
      }
      if (error.message.toLowerCase().includes('model')) {
        return NextResponse.json(
          { error: "Model configuration error. Please check the model name and availability." },
          { status: 500 }
        );
      }
    }
    
    return NextResponse.json(
      { error: "Failed to summarize. Please try again later." },
      { status: 500 }
    );
  }
} 