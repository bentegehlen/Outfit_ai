import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function handler(event) {
  try {
    const { items, style, occasion, extra } = JSON.parse(event.body);

    if (!items || !items.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Keine Items übergeben" })
      };
    }

    // 🔥 Bilder + Beschreibung kombinieren
    const prompt = `
Create a full-body mannequin outfit.

Use these clothing items as reference:
${items.map((i, index) => `Item ${index + 1}: ${i.name}, ${i.category}, ${i.color}`).join("\n")}

Style: ${style || "dark, edgy, clean"}
Occasion: ${occasion || "casual"}
Extra wishes: ${extra || "layered outfit"}

Rules:
- Use layering (multiple tops if possible)
- Combine items into a coherent outfit
- Include legwear if available
- Include accessories if possible

Visual:
- clean mannequin
- neutral background
- studio lighting
- no face
- minimal aesthetic
`;

    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "low"
    });

    const image = response.data[0].b64_json;

    return {
      statusCode: 200,
      body: JSON.stringify({
        image: `data:image/png;base64,${image}`
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
