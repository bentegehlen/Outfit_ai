exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    const { imageDataUrl } = JSON.parse(event.body || "{}");

    if (!imageDataUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Kein Bild erhalten." })
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OPENAI_API_KEY fehlt." })
      };
    }

    const instructions = `
Du analysierst genau EIN Kleidungsstückbild für eine persönliche Outfit-App.
Antworte ausschließlich als JSON ohne Markdown.

Erlaubte category-Werte:
- top
- bottom
- dress
- outerwear
- shoes
- accessory

Erlaubte exposure-Werte:
- covered
- balanced
- revealing

Erlaubte warmth-Werte:
- light
- medium
- warm

Erlaubte styleTags:
- dark
- clean
- sexy
- sporty
- elevated

Erlaubte occasionFit:
- alltag
- office
- date
- festival
- travel

Gib dieses JSON zurück:
{
  "suggestedName": "string",
  "category": "top|bottom|dress|outerwear|shoes|accessory",
  "color": "string",
  "styleTags": ["..."],
  "materialHints": ["..."],
  "exposure": "covered|balanced|revealing",
  "warmth": "light|medium|warm",
  "occasionFit": ["alltag","festival"],
  "confidence": 0.0
}

Regeln:
- Sei konservativ bei Unsicherheit.
- Nenne bei color 1-3 klare Farbbegriffe.
- materialHints nur kurze Begriffe wie mesh, leather, cotton, knit, lace, denim, metal, satin, velvet, sheer.
- confidence zwischen 0 und 1.
- Kein Text außerhalb des JSON.
    `.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              { type: "input_text", text: instructions }
            ]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: "Analysiere dieses einzelne Kleidungsstückbild für den Katalog." },
              { type: "input_image", image_url: imageDataUrl }
            ]
          }
        ]
      })
    });

    const raw = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: raw?.error?.message || "OpenAI-Aufruf fehlgeschlagen.",
          raw
        })
      };
    }

    const text =
      raw?.output_text ||
      raw?.output?.flatMap(item => item.content || []).find(c => c.type === "output_text")?.text ||
      "";

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Antwort konnte nicht als JSON geparst werden.",
          modelText: text
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ analysis })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
