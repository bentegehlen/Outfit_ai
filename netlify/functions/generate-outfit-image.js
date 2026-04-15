export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "OPENAI_API_KEY fehlt." })
      };
    }

    const { items, style, occasion, warmth, extra } = JSON.parse(event.body || "{}");

    if (!Array.isArray(items) || !items.length) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Keine Outfit-Items übergeben." })
      };
    }

    const usableItems = items
      .filter(i => i && typeof i.imageDataUrl === "string" && i.imageDataUrl.startsWith("data:image/"))
      .slice(0, 8);

    if (!usableItems.length) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Keine gültigen Referenzbilder gefunden." })
      };
    }

    const itemLines = usableItems.map((item, idx) => {
      const name = item.name || "item";
      const category = item.category || "unknown";
      const subcategory = item.subcategory || "";
      const color = item.color || "";
      return `${idx + 1}. ${name} | category: ${category} | subcategory: ${subcategory} | color: ${color}`;
    }).join("\n");

    const prompt = `
Create ONE full-body outfit image on a clean mannequin.

Use the uploaded clothing reference images as the basis for the outfit.
Stay visually close to the referenced garments in color, silhouette, and styling.
Do NOT create a face.
Do NOT create a realistic human person.
Use a clean mannequin / dress form aesthetic.
Neutral studio background.
Editorial fashion product look.
Minimal, dark, clean, industrial mood.

Outfit intent:
- Occasion: ${occasion || "alltag"}
- Style: ${style || "dark"}
- Warmth: ${warmth || "medium"}
- Extra wishes: ${extra || "none"}

Layering is very important.
Allowed layering:
- up to 3 upper body layers
- up to 3 legwear layers
- up to 4 accessories

Reference garments:
${itemLines}

Rules:
- Build a coherent, wearable layered outfit.
- Prefer dark, clean, styled combinations.
- If legwear is provided, use it meaningfully.
- If accessories are provided, include them subtly but visibly.
- Keep the mannequin centered and full-body visible.
- Show shoes clearly.
- Output one clean finished fashion image only.
    `.trim();

    const form = new FormData();
    form.append("model", "gpt-image-1-mini");
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("quality", "low");
    form.append("output_format", "png");
    form.append("background", "opaque");

    for (let idx = 0; idx < usableItems.length; idx++) {
      const imageDataUrl = usableItems[idx].imageDataUrl;
      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

      if (!match) continue;

      const mimeType = match[1];
      const base64 = match[2];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const ext =
        mimeType.includes("png") ? "png" :
        mimeType.includes("webp") ? "webp" :
        "jpg";

      const blob = new Blob([bytes], { type: mimeType });
      form.append("image[]", blob, `reference_${idx + 1}.${ext}`);
    }

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const raw = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: raw?.error?.message || "Bildgenerierung fehlgeschlagen.",
          raw
        })
      };
    }

    const b64 = raw?.data?.[0]?.b64_json;
    if (!b64) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Kein Bild in der Antwort erhalten.",
          raw
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: `data:image/png;base64,${b64}`
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message || "Unbekannter Fehler."
      })
    };
  }
}
