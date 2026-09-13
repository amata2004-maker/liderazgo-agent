export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleDailyDraft(env).catch((err) => {
        console.error("handleDailyDraft failed:", err);
      })
    );
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/trigger-test") {
      try {
        await handleDailyDraft(env);
        return new Response("Borrador generado y enviado a tu correo.");
      } catch (err) {
        console.error("trigger-test failed:", err);
        return new Response(`Error generando el borrador: ${err.message}`, { status: 500 });
      }
    }
    return new Response("Liderazgo Agent activo.");
  }
};

// Rota entre 3 temas según el día de la semana — sin estado que guardar (no hay KV).
const CATEGORIES = [
  {
    name: "Tips de liderazgo",
    guia: "Cuenta una anécdota concreta de liderar un equipo — un momento específico con alguien real de tu experiencia (puedes cambiar el nombre o no dar nombre), lo que pasó, y el consejo de liderazgo que se desprende de ahí. Nada de listas de consejos genéricos: una historia con principio y fin.",
    imagePrompt: "Editorial photo of a small diverse team gathered around a table in genuine discussion, warm natural light, cinematic, shallow depth of field, documentary style, no text, no logos, no watermark"
  },
  {
    name: "Reflexiones sobre emprender",
    guia: "Cuenta una historia real y específica de tu camino emprendiendo — un momento difícil, una decisión, un quiebre o un antes/después concreto. Que se sienta una escena, no un resumen abstracto del camino del emprendedor.",
    imagePrompt: "Editorial photo of a lone figure silhouetted at sunrise on a rooftop or beach in a tropical coastal city, contemplative mood, cinematic golden light, shallow depth of field, no visible face, no text, no logos, no watermark"
  },
  {
    name: "Lecciones de liderazgo",
    guia: "Cuenta una historia (tuya, o de alguien que conoces, o un caso conocido) que ilustre un principio de liderazgo al estilo de los grandes autores del tema (John Maxwell y similares) — la historia primero, la lección al final como conclusión natural. Nunca cites ni copies texto de ningún libro.",
    imagePrompt: "Editorial photo symbolizing mentorship, two hands over an open notebook and a compass on a wooden desk, warm cinematic lighting, shallow depth of field, no visible faces, no text, no logos, no watermark"
  }
];

const HASHTAGS = "#liderazgo #alexmatta #liderazgopersonal #emprende #noalaesclavitudmoderna #dejadesertu";

async function handleDailyDraft(env) {
  const today = new Date();
  const category = CATEGORIES[today.getUTCDay() % CATEGORIES.length];

  const draft = await generateDraft(env, category);

  let imageBase64 = null;
  try {
    imageBase64 = await generateImage(env, category.imagePrompt);
  } catch (err) {
    console.error("generateImage failed, se manda el correo sin foto:", err);
  }

  await sendDraftEmail(env, draft, category.name, imageBase64);
}

async function generateImage(env, prompt) {
  const response = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
    prompt,
    steps: 8
  });

  // flux-1-schnell responde { image: "<png en base64>" }.
  if (response && typeof response.image === "string") {
    return response.image;
  }

  // otros modelos de Workers AI regresan bytes binarios directo.
  const bytes = new Uint8Array(response);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function generateDraft(env, category) {
  const systemPrompt = `Eres Alex Matta: emprendedor, creador de contenido digital y conferencista basado en Cancún. Tu bio: "Emprender es valiente. Liderar un equipo que te multiplica, es transformador." Acompañas a otros a emprender.

Escribes posts para tu perfil personal de Facebook contando historias — siempre una anécdota o escena concreta, nunca una lista de consejos ni una reflexión abstracta. En primera persona, con tu propia voz — directo, cercano, sin relleno corporativo, sin emojis excesivos (máximo 1-2 si aportan). Nada de lenguaje de LinkedIn genérico ("En el mundo de hoy...", "Es fundamental destacar que..."). Habla como alguien que de verdad vivió lo que cuenta.

Tema de hoy: ${category.name}
${category.guia}

Estructura: arranca directo en la escena o el momento (sin "Hoy quiero contarles..." ni introducciones), deja que la historia se desarrolle con algún detalle concreto que la haga real, y cierra con la lección o reflexión que se desprende naturalmente de lo que pasó — sin sonar a moraleja de fábula. Termina invitando a comentar o reflexionar, no con un CTA de venta. 80-150 palabras. Responde solo con el post, listo para publicar, sin explicaciones ni etiquetas antes o después.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: "Escribe el post de hoy." }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${data.error?.message || JSON.stringify(data)}`);
  }

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock) {
    throw new Error("Respuesta de Anthropic sin bloque de texto utilizable.");
  }
  return textBlock.text.trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Este agente no publica nada solo — solo redacta y manda por correo.
// Tú copias y pegas el texto a tu perfil personal cuando quieras.
async function sendDraftEmail(env, draft, categoryName, imageBase64) {
  const fullText = `${draft}\n\n${HASHTAGS}`;

  const body = {
    from: env.FROM_EMAIL,
    to: env.APPROVER_EMAIL,
    subject: `Post de hoy — ${categoryName}`,
    html: `
      <h2>Tema: ${escapeHtml(categoryName)}</h2>
      <p style="white-space:pre-line;font-family:sans-serif;border:1px solid #ddd;border-radius:8px;padding:16px;background:#fafafa">${escapeHtml(fullText)}</p>
      <p style="color:#888;font-size:12px">Copia el texto de arriba y pégalo directo en tu perfil de Facebook${imageBase64 ? ", junto con la foto adjunta" : ""}.</p>
    `
  };

  if (imageBase64) {
    body.attachments = [{ filename: "post.png", content: imageBase64 }];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Resend API error (${response.status}): ${data.message || JSON.stringify(data)}`);
  }
}
