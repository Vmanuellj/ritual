// Lee la foto de un ticket con Claude y devuelve los datos del gasto.
// La imagen solo vive en memoria durante la petición: no se guarda en ningún lado.
import Anthropic from "@anthropic-ai/sdk";

const SUPA_URL = "https://tefxfxbdylunaeajtcak.supabase.co";
const SUPA_KEY = "sb_publishable_3CERy3XxHXUWnqyhXnqB4Q_y8IvLrS1"; // llave pública
const CATEGORIES = ["Insumos", "Renta", "Nómina", "Marketing", "Servicios", "Software", "Transporte", "Impuestos", "Equipo", "Otro gasto"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const SCHEMA = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean", description: "true si la imagen es un ticket, factura o comprobante de compra legible" },
    amount: { type: "number", description: "Total pagado en pesos, con impuestos incluidos. 0 si no se ve." },
    date: { type: "string", description: "Fecha de la compra en formato YYYY-MM-DD, o cadena vacía si no aparece" },
    merchant: { type: "string", description: "Nombre del comercio o proveedor, o cadena vacía" },
    concept: { type: "string", description: "Qué se compró, en pocas palabras (máximo 8)" },
    category: { type: "string", enum: CATEGORIES },
  },
  required: ["is_receipt", "amount", "date", "merchant", "concept", "category"],
  additionalProperties: false,
};

const PROMPT = `Analiza esta foto de un ticket o comprobante de un pequeño negocio en México y extrae los datos del gasto.
- amount: el TOTAL final pagado (no el subtotal), como número sin símbolo.
- date: la fecha de la compra en YYYY-MM-DD. Los tickets mexicanos suelen escribir día/mes/año.
- category: la categoría que mejor describa el gasto. Usa "Otro gasto" si ninguna aplica.
Si la imagen no es un comprobante de compra o no se puede leer, marca is_receipt como false.`;

const client = new Anthropic(); // usa ANTHROPIC_API_KEY de las variables de entorno de Vercel

async function userFromToken(token) {
  const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? r.json() : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  // Solo usuarios con sesión iniciada en la app pueden usar el escaneo.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !(await userFromToken(token))) return res.status(401).json({ error: "Inicia sesión para escanear tickets." });

  const { image, media_type } = req.body || {};
  if (typeof image !== "string" || !image || !MEDIA_TYPES.includes(media_type)) {
    return res.status(400).json({ error: "Foto no válida." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    });

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "No se pudo analizar esta imagen." });
    const text = response.content.find((b) => b.type === "text");
    if (!text) return res.status(502).json({ error: "No se obtuvo respuesta. Intenta de nuevo." });
    const data = JSON.parse(text.text);
    if (!data.is_receipt) return res.status(422).json({ error: "No parece un ticket legible. Intenta con otra foto." });
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Falta configurar la llave de Claude en Vercel (ANTHROPIC_API_KEY)." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Demasiadas fotos seguidas. Espera un momento." });
    }
    if (error instanceof Anthropic.APIError) {
      return res.status(502).json({ error: "El servicio de análisis no respondió. Intenta de nuevo." });
    }
    return res.status(500).json({ error: "No se pudo procesar la foto." });
  }
}
