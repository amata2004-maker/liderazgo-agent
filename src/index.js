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
    guia: "Un consejo práctico y accionable sobre liderar equipos o personas. Concreto, algo que se pueda aplicar hoy mismo, no una generalidad."
  },
  {
    name: "Reflexiones sobre emprender",
    guia: "Una reflexión honesta sobre el camino de emprender — el lado difícil y el transformador. En primera persona, desde tu propia experiencia."
  },
  {
    name: "Lecciones de liderazgo",
    guia: "Una lección de liderazgo al estilo de los grandes autores del tema (John Maxwell y similares) — el principio general, explicado con tus propias palabras, sin citar ni copiar texto de ningún libro."
  }
];

const HASHTAGS = "#liderazgo #alexmatta #liderazgopersonal #emprende #noalaesclavitudmoderna #dejadesertu";

async function handleDailyDraft(env) {
  const today = new Date();
  const category = CATEGORIES[today.getUTCDay() % CATEGORIES.length];

  const draft = await generateDraft(env, category);
  await sendDraftEmail(env, draft, category.name);
}

async function generateDraft(env, category) {
  const systemPrompt = `Eres Alex Matta: emprendedor, creador de contenido digital y conferencista basado en Cancún. Tu bio: "Emprender es valiente. Liderar un equipo que te multiplica, es transformador." Acompañas a otros a emprender.

Escribes posts para tu perfil personal de Facebook, en primera persona, con tu propia voz — directo, cercano, sin relleno corporativo, sin emojis excesivos (máximo 1-2 si aportan). Nada de lenguaje de LinkedIn genérico ("En el mundo de hoy...", "Es fundamental destacar que..."). Habla como alguien que de verdad vivió lo que escribe.

Tema de hoy: ${category.name}
${category.guia}

Estructura libre — un gancho que enganche en la primera línea, el cuerpo con la idea desarrollada, y un cierre que invite a comentar o reflexionar (no un CTA de venta). 80-150 palabras. Responde solo con el post, listo para publicar, sin explicaciones ni etiquetas antes o después.`;

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
async function sendDraftEmail(env, draft, categoryName) {
  const fullText = `${draft}\n\n${HASHTAGS}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: env.APPROVER_EMAIL,
      subject: `Post de hoy — ${categoryName}`,
      html: `
        <h2>Tema: ${escapeHtml(categoryName)}</h2>
        <p style="white-space:pre-line;font-family:sans-serif;border:1px solid #ddd;border-radius:8px;padding:16px;background:#fafafa">${escapeHtml(fullText)}</p>
        <p style="color:#888;font-size:12px">Copia el texto de arriba y pégalo directo en tu perfil de Facebook.</p>
      `
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Resend API error (${response.status}): ${data.message || JSON.stringify(data)}`);
  }
}
