import { GoogleGenAI, Modality } from "@google/genai";

export const CHAT_MODEL = "gemini-3.1-pro-preview";
export const TTS_MODEL = "gemini-2.5-flash-preview-tts";

export interface Message {
  role: "user" | "model";
  content: string;
  timestamp: number;
  image?: {
    data: string;
    mimeType: string;
  };
  groundingUrls?: string[];
}

export const getAIInstance = () => {
  const apiKey = (process.env as any).API_KEY || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey });
};

export const systemInstruction = `You are NNM, a highly advanced AI agent dedicated to helping your owner. 
Your persona is professional, efficient, and loyal. 
You are fluent in Kyrgyz (Кыргызча), Russian (Русский), and English. 
Always respond in the language the user uses, or as requested. 
You have access to Google Search for real-time information. 
You can analyze images provided by the user.
Your goal is to be the ultimate assistant.`;

export async function* chatWithNNM(messages: Message[]) {
  const ai = getAIInstance();
  const chat = ai.chats.create({
    model: CHAT_MODEL,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    },
  });

  const lastMessage = messages[messages.length - 1];
  
  let contents: any;
  if (lastMessage.image) {
    contents = {
      parts: [
        { text: lastMessage.content },
        {
          inlineData: {
            data: lastMessage.image.data,
            mimeType: lastMessage.image.mimeType,
          },
        },
      ],
    };
  } else {
    contents = {
      parts: [{ text: lastMessage.content }],
    };
  }

  const history = messages.slice(0, -1).map(m => ({
    role: m.role,
    parts: [{ text: m.content }]
  }));

  const stream = await ai.models.generateContentStream({
    model: CHAT_MODEL,
    contents: [...history, contents],
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }],
    }
  });

  for await (const chunk of stream) {
    const groundingUrls = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((c: any) => c.web?.uri)
      .filter(Boolean);

    yield {
      text: chunk.text,
      groundingUrls
    };
  }
}

export async function generateSpeech(text: string) {
  const ai = getAIInstance();
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    return base64Audio;
  }
  throw new Error("Failed to generate speech");
}
