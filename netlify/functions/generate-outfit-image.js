export async function handler(event) {
  try {
    const { items } = JSON.parse(event.body || "{}");

    if (!items || !items.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Keine Items" })
      };
    }

    // Nur Bilder nehmen, die existieren
    const validItems = items
      .filter(i => i.img && i.img.startsWith("data:image"))
      .slice(0, 6);

    const garmentList = validItems.map((item, i) => {
      return `${i + 1}. ${item.suggestedName || "garment"} (${item.category || ""}, ${item.color || ""})`;
    }).join("\n");

    // 🔥 WICHTIG: extrem klare Bildanweisung
    const prompt = `
Create a FULL BODY fashion mannequin image.

STRICT RULES:
- The ENTIRE mannequin must be visible from head to feet.
- Include head shape (no face details), neck, shoulders.
- Include ears so earrings are visible.
- Include legs and FULL feet so shoes are visible.
- DO NOT crop anything.
- The mannequin must be centered and fully inside frame.

STYLE:
- clean fashion studio
- neutral background (light gray or white)
- no environment
- no props
- no shadows cutting off feet

OUTFIT:
Use these garments as inspiration:
${garmentList}

RULES:
- Build a realistic layered outfit
- Max 3 upper layers
- Max 3 legwear layers
- Max 4 accessories
- Respect proportions
- Dark, industrial, clean styling

OUTPUT:
One single image.
    `;

    const form = new FormData();

    form.append("model", "gpt-image-1-mini");
    form.append("prompt", prompt);

    // 🔥 PORTRAIT FORMAT → verhindert abgeschnittene Füße
    form.append("size", "1024x1536");

    form.append("quality", "low");
    form.append("output_format", "png");

    // Referenzbilder anhängen
    validItems.forEach((item, index) => {
      const base64 = item.img.split(",")[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });

      form.append("image[]", blob, `item_${index}.png`);
    });

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: 500,
        body: JSON.stringify(data)
      };
    }

    const image = data.data?.[0]?.b64_json;

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
