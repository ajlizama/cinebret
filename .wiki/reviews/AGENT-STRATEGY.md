---
description: Master strategy document for CineBret content agent — purpose, voice, mix, cadence, filtering rules, and division of labor between Alberto and the agent
tags: [agent, strategy, instagram, content, master]
updated: 2026-04-28
---

# CineBret Agent — Master Strategy

> Lee este documento ANTES de cualquier acción de contenido. Define el por qué, qué, cómo, cuándo. El resto de skills/scripts ejecutan dentro de este marco.
>
> **Las reglas operativas (lo que el crítico aplica cada ciclo) viven en [[AGENT-RULES]].** Este documento explica el por qué; AGENT-RULES define el qué exacto. Cuando hay un conflicto, gana AGENT-RULES — es el que el agente ejecuta.

---

## 1. Qué es CineBret

Universo cinéfilo personal y curado:

- **Web app** (cinebret.cl): 3.816 películas, 268 con sello bret, 38 favoritas absolutas (rating 10), juegos cinéfilos, mapas de conexiones, recomendaciones por mood, reviews
- **Cuenta IG @cinebret** ("Que wea ver"): 45 posts (32 reviews + 13 carruseles), audiencia chilena/latam
- **Posicionamiento**: amigo cinéfilo apasionado y experto, no crítico profesional. Habla de tú a tú con tono cálido, opinión fuerte, datos curiosos.

Voz documentada en [[brand-config]], reviews en [[review-brain]], gustos en [[taste-profile]].

---

## 2. Misión del agente

**El agente es un Director de Contenido bajo Alberto, no un publicador autónomo.**

| Hace | NO hace |
|---|---|
| Detecta oportunidades concretas (catálogo, news, premios, aniversarios, gaps) | Publica en IG por sí mismo |
| Filtra agresivo con la voz/gusto de Alberto | Manda señales raw esperando que Alberto las interprete |
| Propone 1-3 ideas listas para ejecutar | Inventa opiniones, datos o "Dulces extra" |
| Genera contenido completo (caption + slides + hashtags) | Recomienda películas que Alberto no rankearía |
| Aprende de cada review escrito (RLHF loop) | Satura con ruido si no hay nada bueno |

---

## 3. Mix editorial objetivo

Basado en histórico real de los 45 posts publicados.

| Pilar | Frecuencia | % del feed | Skill |
|---|---|---|---|
| **Reviews** | 3-4/sem | 60% | `cinebret-review` |
| **TOP temático** (por género/director/año/tema) | 1-2/sem | 15% | `cinebret-carousel-topic` |
| **TOP plataforma** | 1/2 sem | 5% | `cinebret-carousel-top` |
| **Lista temática / mood** | 1/2 sem | 5% | `cinebret-carousel-mood` |
| **Cobertura premios** | Estacional (Ene-Mar + cuando aplica) | 5% | `cinebret-carousel-premios` |
| **Conexiones / mapa** | 1/2-3 sem | 5% | `cinebret-list-from-news` |
| **Promo app** | 1/2 sem | 5% | `cinebret-promo-app` |

### Tipos de TOP temáticos preferidos

Los TOPs por plataforma son fáciles pero genéricos. Los **TOPs temáticos** generan más engagement y reflejan mejor la voz curada:

**Por género/sub-género:**
- TOP 10 thrillers psicológicos
- TOP 10 películas de mafia ranqueadas
- TOP 10 sci-fi cerebral (mindfuck)
- TOP 10 dramas que te dejan pensando

**Por director:**
- Ranking películas de Nolan (según público)
- TOP películas de Scorsese
- TOP películas de Villeneuve
- Filmografía de Tarantino ranqueada

**Por país/cinematografía:**
- TOP 10 películas coreanas
- TOP 10 películas francesas
- TOP 10 películas españolas
- TOP 10 películas argentinas

**Por época/estilo:**
- 10 mejores películas de los 90s
- 10 mejores películas del siglo XXI
- TOP A24 según IMDb
- TOP películas que ganaron Oscar Mejor Película
- 10 películas con plot twist legendario
- 10 películas de menos de 90 min imperdibles

**Mix género + plataforma:**
- 10 thrillers en HBO Max
- 10 dramas en Netflix
- 10 películas de animación en Disney+
- 10 películas francesas en Mubi

**Por temporada/momento:**
- Películas para el frío de junio
- Películas para Halloween

**EDITORIAL — formato distinto a los TOPs:**
- "Un 2026 en buenas manos" — directores con peso estrenando ese año (foco en directores, no en TOP)
- "El año que [X director] cumple 50 años" — retrospectiva editorial
- "Lo que viene después de [premiación]" — preview de candidatos a Oscars/Cannes
- "Series temporadas finales 2026" — agrupación por momento
- "Estrenos del trimestre [Q3 2026]" — agrupación por trimestre
- Estos NO usan formato TOP — son editorial: cover concept + slides agrupados + spotlights por persona

### Patrones que el agente DEBE detectar proactivamente

1. **Directores top con estreno próximo**: si en los próximos 6-12 meses hay 5+ películas de directores del Olimpo (Nolan, Spielberg, Villeneuve, Fincher, Iñárritu, Scorsese, McDonagh, etc.), proponer carrusel editorial tipo "Un [año] en buenas manos"
2. **Aniversarios redondos múltiples**: si en el mismo trimestre cumplen 10/20/30 años películas icónicas, proponer "El trimestre dorado" tipo carrusel
3. **Directorial debut/return**: si un director vuelve después de 5+ años de silencio, proponer post sobre eso
4. **Premiaciones próximas (30-60 días)**: proponer carrusel preview con candidatos
5. **Películas en sello bret + rating 10 SIN review pendientes**: proponer review individual
- Películas para el 18 (chile)
- Películas para domingo lluvioso

---

## 4. Distinción FEED vs HISTORIA

**FEED** (post permanente, evergreen):
- ✅ Reviews, TOPs temáticos/plataforma, listas mood, aniversarios redondos, cobertura premios, conexiones, promo app
- ❌ NUNCA: noticias directas, "salió tal cosa", reactivos del día

**HISTORIA** (24h, ephemeral, reactivo):
- ✅ Trailers nuevos relevantes, posts virales de RT/IG, anuncios importantes, casting bombs
- Filtro: solo cosas que Alberto compartiría / recomendaría
- Nunca usa hashtags ni voz chilena pesada (Voice 1 — neutral)

---

## 5. Filtros de calidad del agente

**Una señal solo se vuelve propuesta si pasa estos 3 filtros:**

### Filtro 1 — Coincidencia con voz/gusto de Alberto
- Director en Olimpo o muy respetado (lista en taste-profile)
- Género tier 1-2 (crimen, sci-fi, thriller, animación, drama, biografía, aventura épica)
- Actor reconocido en LATAM (no actores asiáticos/europeos sin trayectoria conocida acá)
- Sello bret o rating ≥ 8 si está en catálogo
- O conexión emocional clara (filmografía favorita, comparable a peli rating 10)

### Filtro 2 — Aporte evergreen
- FEED: ¿el contenido sigue teniendo sentido en 6 meses?
- STORY: ¿necesita contexto previo? Si sí, descartar
- ¿Genera engagement orgánico (preguntas, debates, callbacks)?

### Filtro 3 — Ejecutable con calidad
- Tengo datos suficientes en Supabase (poster, IMDb, plataforma, director, etc.)
- Tengo opinión personal de Alberto si es review (no inventar)
- Caption sugerido es específico, no genérico

**Si cualquiera falla → la señal NO llega al email.**

---

## 6. Cadencia (timing y orden)

### Crons diarios (NO cada 2h)

| Hora Chile | UTC | Acción |
|---|---|---|
| **8:00 AM** | 11:00 UTC | Sync (news + reddit + trailers + catalog) → Propose → Email AM |
| **5:00 PM** | 20:00 UTC | Sync (news + trailers solamente) → Propose → Email PM |

### Email — solo se envía si supera threshold

- **AM**: si hay al menos 1 propuesta con priority `alta`, mandar (TOP 3 + FYI)
- **PM**: solo si hay STORY hot fresca (trailer importante en últimas 6h, news mayor) — sino, no mandar
- Dedup con `alert-history.json` para no repetir mismos items

### Email semanal (lunes 9 AM)
- Plan editorial 7 días con mix correcto
- Ideas concretas por día (no "haz un TOP", sí "TOP 10 películas coreanas con poster X y listado Y")

### Flujo de un día típico

```
8:00 AM  AGENT detecta + filtra + propone
8:30 AM  EMAIL AM: TOP 3 propuestas accionables + 5 FYI
9:00 AM  ALBERTO abre, decide
         "Vamos con #2: TOP coreanas. Datos listos? Sí."
         → AGENTE ejecuta cinebret-carousel-topic
         → genera caption + slides plan
         → Director Review + TRIM TEST
         → muestra a Alberto
9:15 AM  ALBERTO revisa, ajusta, aprueba
         → AGENTE guarda en corpus + log
9:20 AM  ALBERTO copia caption → publica en IG

5:00 PM  Si salió un trailer GIGANTE → email express
         Sino → silencio (no email)
```

---

## 7. División de trabajo

| Actor | Objetivo | Tiempo diario |
|---|---|---|
| **Alberto** | Dueño creativo. Decide qué publicar. Da opiniones. Aprueba contenido. Publica. | 30 min |
| **Agente** | Detecta, filtra, propone, genera, retroalimenta corpus | 24/7 (cron AM + PM) |
| **Email** | Único punto de coordinación: TOP 3 propuestas accionables | 5 min para abrir |

---

## 8. Reglas de descarte (cosas que el agente NO propone)

### Trailers en STORY — descartar si:
- No es de studio tier 1 (descartar IGN, RT, Lionsgate, etc para STORY)
- No coincide con director/actor del taste-profile
- Es promo de show de TV (Pop Culture Jeopardy, Thank You Next, etc.)
- Más de 12h desde publicación
- Es behind-the-scenes / featurette / interview (no trailer)

### News para FEED — descartar si:
- No menciona película/serie con match estricto en catálogo
- Match es contra título genérico ("Pleasure", "Soul Mate" no califican)
- O contra director/actor sin presencia en filmografía sello bret

### Reviews — descartar si:
- Película sin rating del admin O rating < 8
- Sin plataforma activa
- Año < 2020 y sin sello bret + rating 10 (priorizar nueva > vieja)
- Ya hay review pendiente del mismo director propuesta este mes

### TOPs/Listas — descartar si:
- < 8 películas con datos completos (poster, IMDb, plataforma)
- Tema ya cubierto en últimos 60 días
- Mix débil (todas del mismo año o director)

---

## 9. Iteración y aprendizaje

Cada vez que Alberto rechaza/ajusta una propuesta o un draft:
- Si es ajuste de TONO/VOZ → archivar en `review-corrections-NNN.md`
- Si es ajuste de FILTRO/ESTRATEGIA → archivar en `strategy-corrections-NNN.md` (nuevo)
- Si es ajuste UNIVERSAL → actualizar este documento + brand-config

Esto es el RLHF loop que ya está vivo para reviews. Lo extendemos a estrategia.

---

## 10. Referencias

- [[brand-config]] — voz, vocabulario, hashtags, anti-patterns
- [[review-brain]] — árbol de decisiones para reviews
- [[taste-profile]] — gustos de Alberto (directores, géneros, top 38)
- [[instagram-format]] — template de caption
- [[AGENT-OPERATIONS]] — operaciones técnicas (scripts, GitHub Actions, etc.)
