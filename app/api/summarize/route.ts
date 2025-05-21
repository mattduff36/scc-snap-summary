import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Google Generative AI with your API key
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Summarize the following text into 1-4 short sentences. The summary should start with the most relevant information, as the first 5-6 words will be used as a text thumbnail. Include any reference numbers or key identifiers.

Text to summarize:
${text}`;

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
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: "Failed to summarise. Please check your API key and try again." },
      { status: 500 }
    );
  }
} 