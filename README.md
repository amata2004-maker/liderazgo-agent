# Liderazgo Agent

Agente que redacta un post diario para el perfil personal de Facebook de Alex Matta,
rotando 3 temas (tips de liderazgo, reflexiones sobre emprender, lecciones de
liderazgo), y lo manda por correo listo para copiar y pegar.

**No publica nada automáticamente** — a diferencia del agente de MyActif, este no
tiene un paso de aprobación con link, porque la API de Meta no permite publicar en
perfiles personales (solo en Páginas). El correo diario *es* el resultado final:
lo copias y lo pegas tú mismo.

## Flujo
1. Cron diario (8am Cancún) → genera el post con Claude API.
2. Te llega un correo con el texto listo (post + hashtags).
3. Lo copias y pegas en tu perfil de Facebook cuando quieras.

## Setup

```bash
npm install
```

### 1. Configurar secretos
```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put FROM_EMAIL          # ej. posts@myactif.net (dominio ya verificado en Resend)
npx wrangler secret put APPROVER_EMAIL      # tu correo, ej. amata2004@gmail.com
```

### 2. Desplegar
```bash
npx wrangler deploy
```

### 3. Probar sin esperar al cron
Visita `https://TU-WORKER.workers.dev/trigger-test` — genera y envía un post de prueba.

## Pendiente / ideas futuras
- Convertir a Página de Facebook si en algún momento se quiere automatizar la
  publicación completa (la API de Meta no publica en perfiles personales).
- Tarjeta de imagen de marca (como en MyActif) si se define una paleta/logo
  para la marca personal.
