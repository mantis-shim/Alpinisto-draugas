# Alpinisto draugas (AD) — "Hiker's Friend"

University course project (VILNIUS TECH, "Informacinės sistemos programų kūrimas"), team "PROgramuotojai":
Naglis Maniušis, Mantas Šimaitis, Vincentas Skolevičius, Upyna Bloškytė, Danielius Miliunec.
Source of truth: the team's requirements spec "Poreikių specifikacija" v01 (2026-09-16, PDF, not in repo).
This file condenses it. Where the spec is silent, see **Open decisions** at the bottom; don't invent behaviour silently.

## What it is

A web app that helps **beginner mountain hikers** prepare for a hike. Beginners overestimate their fitness, pick the
wrong route, and forget gear (first-aid kit, enough water). The app replaces their subjective judgement with:

1. **Inventory**: the user records the gear they own, typed in by hand or recognised from a photo by a local AI model.
2. **Fitness questionnaire**: a short questionnaire assigns a fitness level (žemas / vidutinis / aukštas).
3. **Trip details**: location (free text) plus departure and return dates.
4. **Recommendations**: an external LLM combines 1–3 into a feasibility verdict, a difficulty-vs-fitness check, a
   weather estimate, clothing advice, a packing list ("take from inventory" / "need to buy") and a short location description.

Users: individual hikers, no IT skills assumed, often on a phone with a slow connection. There's one actor, no admin role.

## Hard constraints

- **Web app only** (no native app), used mostly from phone browsers. Mobile-first and responsive, light/dark theme.
- **Slow networks** (mountains, rural areas): keep pages light, fewer requests, the PDF export must be ≤ 1 MB.
- **UI language: Lithuanian.** All labels, messages and AI output shown to users. Code identifiers, file names and comments are **English**.
- **GDPR (BDAR)**: no data is stored at registration without consent; nothing goes to the external LLM without consent
  or after consent is withdrawn; deleting the account deletes all of the user's data.
- **AI output is advice, not a guarantee.** Every recommendation view and the PDF show that it may be wrong.
  If data is missing, the system says so and never invents facts.
- Only open-source or free libraries (PA-5). Secrets stay in `.env`, and only `.env.example` (no values) is committed (PA-6).

## Tech stack

| Part | Choice | Notes |
|---|---|---|
| Framework | SvelteKit 3 + Svelte 5 (runes forced on) | Config lives in `vite.config.ts` (there is no `svelte.config.js`). Use `$state`/`$derived`/`$props`. |
| Language | TypeScript | `npm run check` must pass |
| Server | `@sveltejs/adapter-node` on Node 24 | Linux in production |
| Database | MongoDB 8 + Mongoose 9 | Document model: **no foreign keys, no joins**. Embed, or link by `userId`. |
| External LLM | Anthropic API, `@anthropic-ai/sdk` (not installed yet), model `claude-opus-5-5` | Generates recommendations (UC-7). See **LLM notes**. |
| Local vision model | llama.cpp `llama-server`, OpenAI-compatible HTTP API at `LLAMA_URL` | Recognises items in photos (UC-3). Runs **outside Docker** on the host. Photos never go to third parties. |
| Lint | ESLint (`npm run lint`) | Must pass |
| Weather | **No weather API** (team decision) | The LLM estimates typical conditions from location + dates. The UI must say the weather info is an estimate. |

## Running (dev)

```sh
cp .env.example .env          # fill ANTHROPIC_API_KEY
docker compose up             # app http://localhost:5173, MongoDB localhost:27017 (no auth, dev only)
docker compose exec app npm install <pkg>   # add a dependency (updates package.json + container)
docker compose down -v        # stop and wipe DB + container node_modules
```

- The app container runs `npm install` on every start, so deps stay in sync with `package.json`.
- `MONGODB_URI` is set by compose (`mongodb://mongo:27017/alpinisto-draugas`). Read it via `$env/dynamic/private`.
- Hot reload on Windows needs file polling (`USE_POLLING=true`, already wired in `vite.config.ts`).
- The local llama.cpp server is started separately on the host, and the app reaches it at `http://host.docker.internal:8080`.
- There's no production Docker setup yet (dev only by decision). Production target: Linux, Node runtime, HTTPS 443, Mongo
  and llama.cpp in an internal network.

## Architecture

Layered (Coad–Yourdon), from the component diagram. UI and orchestrator are the same SvelteKit project.

- **UI**: SvelteKit pages: login/account (UC-1, 9, 12), questionnaire (UC-5), trip input (UC-6), inventory (UC-2–4),
  recommendations + history (UC-7, 8, 10, 11). Talks to the server over HTTPS, JSON for data and `multipart/form-data` for photos.
- **Orchestrator (backend)**: SvelteKit server code (`+page.server.ts` form actions, `+server.ts`, `src/lib/server/`).
  Logical components: auth & consent, fitness assessment, hike, inventory, recommendations & history (+ PDF export),
  **data access** (the only code that touches Mongo), **AI orchestration** (builds the LLM request, validates the response,
  stores the recommendations).
- **Data**: MongoDB. The client never talks to the DB directly.
- **Item recognition subsystem**: local llama.cpp model. Gets a photo, returns name, category, attributes and confidence.
- **External LLM**: only the AI orchestration component calls it, behind one module, so the provider/model can be swapped.
- Don't call OS APIs directly. Use the Node stdlib and framework abstractions (portability requirement).

## Data model (3 collections)

```
users
  _id, email (unique), passwordHash, createdAt, updatedAt
  fitnessAssessment?: { averageDailySteps: int, hikesLast3Years: int, level: LOW|MEDIUM|HIGH, completedDate }
  consents: [{ version: string, givenAt, withdrawn: bool, withdrawnAt? }]

items                      // the user's inventory
  _id, userId, name, category: ItemCategory, suitability: Temperature[]
  attributes: [{ name, value }]

hikes
  _id, userId, location, departureDate, returnDate, season: Season
  plan?: {                 // appears once recommendations are generated
    request: { createdAt, sentContent, usedItemIds[] }
    recommendations: {
      difficulty: HikeDifficulty, feasibility: string, weather: string,
      locationDescription: string, generatedAt,
      items: [{ name, category, explanation, owned: bool, inventoryItemId? }]
    }
  }

ItemCategory  = FOOTWEAR | CLOTHING | SLEEP | NAVIGATION | MEDICINE | FOOD | TOOLS | OTHER
Temperature   = COLD | WARM | HOT
Season        = WINTER | SPRING | SUMMER | AUTUMN
HikeDifficulty= EASY | MEDIUM | HARD
FitnessLevel  = LOW | MEDIUM | HIGH   (UI: žemas / vidutinis / aukštas)
```

- Deleting a user deletes their `items` and `hikes` too (composition).
- A history entry stores recommendations **as generated**. Never regenerate when reopening.
- Known gaps the model needs (add them, see Open decisions): per recommended item `priority` (Būtinas/Rekomenduojamas)
  and `purchased`; clothing recommendations text; the difficulty-vs-fitness verdict.

## Features

Sprints: **1** auth + consent + inventory · **2** questionnaire, trip and AI recommendations · **3** history, PDF, account deletion.
IDs: US = user story, UC = use case, FR = functional requirement. Owner = the team member responsible for the story.

### UC-1 Register / log in / log out (US-1, Naglis, S1) FR-1–6
- Register with email + password. Password: ≥ 8 characters, ≥ 1 uppercase letter, ≥ 1 digit. On failure, say which rule failed.
- Email already registered: say so and offer "Prisijungti".
- Registration runs UC-12 (consent checkbox). Without consent, no account is created and nothing is stored.
- Login failure shows **one generic message** that doesn't reveal whether the email or the password was wrong.
- After login, redirect to the trip planning page. "Atsijungti" is available anywhere: it ends the session and shows login.
- Store only a password hash.

### UC-2 Add item manually (US-5, Vincentas, S1) FR-11–14
- Fields: name (required), category (from the list), other attributes.
- While typing the name, suggest common hiking items.
- Empty name: highlight the field and don't save. Same name already in the inventory: warn about the duplicate and let the user save anyway or cancel.

### UC-3 Recognise item from photo (US-2, US-4, Vincentas, S1) FR-15–25
- "Įkelti iš galerijos" lets the user pick **one** photo. Accept JPG, PNG or HEIC ≤ 10 MB, otherwise show a clear error with the reason.
- Show a preview before sending, and let the user replace the photo. If gallery permission is missing, explain how to grant it.
- Send it to the local model, which returns name, category, attributes (e.g. colour, material, weight, or tags such as
  `neperšlampamas`, `sunkus`, `apsaugo_nuo_uodų`) and a confidence %. **Result within 10 s** (NŠ-1).
- Confidence < 70 %: tag the item "Patikrinkite".
- Not recognised: tip "photograph in a bright place, one item per frame" and offer manual add (UC-2 form).
- Show attributes next to the photo. Each attribute can be **confirmed / edited / rejected**, the name is editable, and there's a
  "Patvirtinti visus" button. Rejecting the whole item saves nothing. **Only confirmed items enter the inventory.**
- Photos are processed and discarded, **never stored**.
- HEIC: most browsers can't render it in `<img>`, so convert it before preview or model input.

### UC-4 View & manage inventory (US-10 Mantas, US-14 Naglis, S1) FR-26–30
- List all items with name, category and suitability tags. Sort by name, filter by category, search by name.
- Empty inventory: show a message with a "Pridėti daiktą" link.
- Edit name, category and attributes. "Išsaugoti" saves, "Atšaukti" leaves the item unchanged.
- Delete only after a confirmation dialog. Deleted items aren't used in **new** recommendations (history stays as it was).

### UC-5 Fitness questionnaire (US-6, Upyna, S2) FR-31–34
- A few questions (at least: average daily steps, mountain hikes in the last 3 years). Keep it short: too long scares
  users off, too short gives a bad estimate.
- All answers required. Unanswered questions are highlighted and the form can't be submitted.
- The backend (not the AI) assigns the level žemas / vidutinis / aukštas and shows it.
- The user can view and change answers later, and the level is recalculated.

### UC-6 Trip details (US-7, US-8, Upyna, S2) FR-35–38
- Location as free text, required (error if missing), changeable before generating.
- Departure and return dates (`YYYY-MM-DD`). Departure ≥ today, return ≥ departure, clear error otherwise.
- Departure date far away: warn that the weather estimate may be inaccurate and may change.
- The backend computes duration (days) and season from the dates, saves the trip, and shows a summary with a "Generuoti rekomendacijas" button.

### UC-7 Generate recommendations (US-3, 15–20; Vincentas, Naglis, Danielius, S2) FR-39–48
- Needs consent (UC-12). Collect trip details, fitness level and inventory into **one** LLM request, with a loading indicator while it runs.
- Empty inventory: warn that the list will contain everything because we know nothing about their gear. Continue if the user confirms.
- No questionnaire: say the difficulty comparison will be limited and offer UC-5.
- The LLM must produce:
  - **Feasibility**: route difficulty, distance and elevation change, and estimated duration vs the user's available time (dates). Give a clear verdict if it isn't realistic.
  - **Difficulty vs fitness**: if the hike may exceed the user's level, a warning plus the main factors behind it.
  - **Weather estimate**: temperature, precipitation, wind for that place and those dates.
  - **Clothing advice**: layers for the temperature, waterproof gear if rain is expected, extra warm/windproof layers for cold or strong wind.
  - **Packing list** compared with the inventory: items to take from the inventory, plus missing items grouped by category, each
    marked **Būtinas** or **Rekomenduojamas** with a short reason.
  - **Short location description**: landscape, natural features, anything notable.
  - Wherever data is insufficient, say so. If there's no reliable information about the place, leave the description out. **Never invent facts.**
- LLM error or timeout: show an error with "Bandyti dar kartą".
- Save the result automatically to history with location + dates.

### UC-8 View recommendations (S2) FR-49–52
- Always show the disclaimer: these are only tips and may be inaccurate.
- Order: location description, weather, feasibility + difficulty-vs-fitness, clothing, then the packing list split into
  **"Pasiimti iš inventoriaus"** and **"Reikia įsigyti"**.
- Items can be marked as bought ("Įsigyta"), which removes them from the shopping list **and adds them to the inventory**
  (name + category from the recommended item).
- Verdicts must never read as a guarantee that the hike is safe or unsafe.

### UC-9 Delete account (US-9, Upyna, S3) FR-53–55
- "Ištrinti paskyrą" in account settings opens a confirmation dialog warning that it's irreversible. On confirm, delete account, inventory,
  questionnaire and trips, end the session, and go to the start page. The same email can register again later.

### UC-10 Download PDF (US-11, Mantas, S3) FR-56
- "Atsisiųsti PDF" exports the recommendations with the generation date and a warning that the weather may have changed since. ≤ 1 MB.
  On failure, show an error and offer a retry. The point is offline use in the mountains.

### UC-11 Trip history (US-12, Mantas, S3) FR-57–59
- Newest first, each entry showing location + dates. Opening an entry shows the recommendations exactly as generated. Any entry can be deleted.
- Empty history: show a message and a "Pridėti kelionę" button.

### UC-12 Data processing consent (US-13, Mantas, S1, built together with registration) FR-7–10
- At registration, show the privacy policy: what is sent to the external AI (trip details, fitness level, inventory) and why,
  plus a required checkbox.
- Record consent with date/time and policy version. Every request checks that the user accepted the **latest** policy version,
  and blocks use until they do.
- Consent can be withdrawn in account settings. After that, nothing is sent to the external LLM (block generation and explain why).

## UI rules

- One term per concept, everywhere:

  | Term | Meaning |
  |---|---|
  | Inventorius | the user's owned items, never the packing list |
  | Daiktas | one inventory item |
  | Ekipuotė | hiking gear in general |
  | Reikalingų daiktų sąrašas | items needed for this hike (LLM output) |
  | Fizinio pasirengimo klausimynas | the fitness questionnaire |
  | Žygio vieta / išvykimo data / grįžimo data | trip location / departure date / return date |
  | Maršruto sudėtingumas, Oro sąlygos, Aprangos rekomendacijos | route difficulty, weather, clothing advice |
  | Rekomendacijos | the full result set |
  | Kelionių istorija | trip history |
  | Duomenų tvarkymo sutikimas | data processing consent |

- The same action has the same label everywhere: "Išsaugoti", "Atšaukti", "Ištrinti", "Pridėti daiktą", "Patvirtinti visus",
  "Generuoti rekomendacijas", "Atsisiųsti PDF", "Bandyti dar kartą", "Prisijungti", "Registruotis", "Atsijungti".
- Keep user-entered data visually separate from AI-generated content. AI-recognised items are always reviewable before saving.
- Messages are short and plain Lithuanian: no technical terms, error codes or stack traces. Say what to fix or do next.
- Before any irreversible delete (item, history entry, account), name exactly what will be deleted and ask for confirmation.
- Explain specialised hiking terms for beginners.
- Validation is consistent: required fields are marked, errors are shown next to the field.

## LLM notes (Anthropic, Claude Opus 5.5)

- Package `@anthropic-ai/sdk`, model ID `claude-opus-5-5` (exact string, no date suffix). Read `ANTHROPIC_API_KEY` from env, server side only.
- Use **structured outputs** (`output_config.format` / `client.messages.parse()`) so the reply maps straight to the
  `recommendations` shape. Still validate it before saving.
- Opus 5.5: thinking is always on. Don't send `thinking: {type: "disabled"}` or `budget_tokens` (400). Tune depth with
  `output_config.effort` (default `medium`). No assistant prefill, no forced `tool_choice` (`any`/`tool` returns 400).
- Check `stop_reason` (handle `"refusal"`, `"max_tokens"`) before reading content. Use the SDK's typed errors
  (`Anthropic.RateLimitError`, `Anthropic.APIError`, ...) for the retry UX.
- Send only what's needed: trip details, fitness level, inventory. **Never** email, password or user IDs.
- Write the prompt in a way that makes the model answer in Lithuanian, state missing data explicitly, and not invent facts.

## Conventions & workflow

- ESLint and `svelte-check` must pass. English identifiers, Lithuanian UI text.
- Git: **everything has to be committed**. Don't leave work uncommitted.
  - Work on `feature/{feature_name}` branches created from `develop`. When the feature is done, merge it into `develop`.
  - Code reaches `main` only via a reviewed pull request from `develop`.
  - The `develop` branch doesn't exist yet. Create it from `main` first.
- Never commit secrets. New env vars go into `.env.example` without values.

## Open decisions (not in the spec — decide, then record the answer here)

1. **Sessions/auth mechanism.** Suggestion: httpOnly cookie with a random session ID stored in Mongo, passwords hashed with `node:crypto` scrypt (no extra deps).
2. **Questionnaire**: exact questions and the scoring formula for žemas/vidutinis/aukštas.
3. **"Far" departure date** threshold for the weather warning.
4. **Local vision model**: which multimodal GGUF for llama.cpp, and a prompt that returns JSON (name, category, attributes, confidence).
5. **PDF library** (must keep output ≤ 1 MB).
6. **Data model gaps**: `priority` + `purchased` on recommended items, clothing text, difficulty-vs-fitness verdict.
7. **Spec conflict**: UC-12's privacy text lists item photos as sent to the external AI, but the architecture keeps photos
   on the local model. Follow the architecture and fix the policy text.
