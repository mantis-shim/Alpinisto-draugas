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
| Local vision model | llama.cpp `llama-server`, OpenAI-compatible HTTP API at `LLAMA_URL` | Recognises items in photos (UC-3). Runs on a **separate team device** reached over the network, not in Docker. Photos never go to third parties. |
| Lint | ESLint (`npm run lint`) | Must pass |
| Weather | **No weather API** (team decision) | The LLM estimates typical conditions from location + dates. The UI must say the weather info is an estimate. |

## Running (dev)

```sh
cp .env.example .env          # fill ANTHROPIC_API_KEY
docker compose up             # app http://localhost:5173, MongoDB localhost:27017 (no auth, dev only)
docker compose exec app npm install <pkg>   # add a dependency (updates package.json + container)
docker compose exec app npm run db:seed     # demo user demo@example.com / Demo1234 (re-runnable)
docker compose down -v        # stop and wipe DB + container node_modules
npm run check:auth            # self-check: password hashing + registration rules (plain Node, no DB)
docker compose exec app npm run check:inventory   # self-check: inventory CRUD + item form rules against the dev DB (cleans up after itself)
npm run check:trip            # self-check: trip form rules, duration, season, far-date warning (plain Node, no DB)
npm ci                        # on the host too: the container's node_modules is a separate volume, so the editor needs its own copy for types
npm run check:fitness         # self-check: questionnaire validation + fitness level formula (plain Node, no DB)
docker compose exec app npm run check:photo         # self-check: photo upload rules + WebP preview + HEIC -> PNG for the model (no DB)
docker compose exec app npm run check:recognition   # self-check: llama-server request (fetch stubbed), answer checks, retries, every mock scenario, form pre-fill
```

- The app container runs `npm install` on every start, so deps stay in sync with `package.json`.
- Env vars (SvelteKit 3): declare them in `src/env.ts` with `defineEnvVars`, which checks them at startup, and import them from
  `$app/env/private`. `$env/dynamic/private` no longer exists. `MONGODB_URI` is set by compose (`mongodb://mongo:27017/alpinisto-draugas`).
- The DB connection opens once in the `init` hook (`src/hooks.server.ts` → `src/lib/server/db.ts`).
- The demo account is for development and the course demo only: no real personal data in seeds.
- `npm run build` checks env vars too, so it needs `MONGODB_URI` set, e.g.
  `MONGODB_URI=mongodb://localhost:27017/alpinisto-draugas npm run build`.
- SvelteKit's CSRF origin check runs **only in production builds** (it's off in `vite dev`). Test cross-site behaviour
  against `node build`.
- Hot reload on Windows needs file polling (`USE_POLLING=true`, already wired in `vite.config.ts`).
- The llama.cpp server runs on a separate device. Set `LLAMA_URL` to its address (`http://host.docker.internal:8080` only if it runs on this machine).
  Without the model, set `RECOGNITION_MOCK=<scenario>` (`src/lib/server/llama_api/recognition-mocks.ts`, one per branch of the
  UC-3 flow; `check:recognition` tests the same ones).
  The model sits behind `RecognitionModel` (`src/lib/server/llama_api/recognition.ts`): `llamaModel` is the real one, `mockModel` the stand-in.
- A variable added to `src/env.ts` is only read when the dev server starts: `docker compose restart app` after adding one.
- Photo uploads (UC-3): `src/lib/server/photo.ts` checks type/size by content (`readPhoto`) and re-encodes every photo in
  memory with sharp: upright, ≤ 1024 px, no metadata, at most 50 Mpx decoded (a small file can declare a huge image).
  `photoToWebp` is the browser preview. **llama-server reads only JPG and PNG** (WebP/HEIC: HTTP 400), so `photoForModel` keeps
  JPG as JPG and turns PNG and HEIC into PNG; no uploaded file reaches the model device as is (security review 2026-11-24).
  HEIC is decoded with `libheif-js` directly (sharp's prebuilt binaries can't read it), not `heic-decode`, which leaked
  libheif's memory on unreadable files. `scripts/fixtures/blank.heic` was made with pillow-heif (sharp can't write HEIC).
  Production needs `BODY_SIZE_LIMIT=11M` (adapter-node default is 512K).
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
- **Item recognition subsystem**: local llama.cpp model. Gets a photo, returns name, category, suitability and attributes.
- **External LLM**: only the AI orchestration component calls it, behind one module, so the provider/model can be swapped.
- Don't call OS APIs directly. Use the Node stdlib and framework abstractions (portability requirement).

## Data model (4 collections)

Source of truth: `src/lib/server/models.ts` (Mongoose models `User`, `Item`, `Hike`, `Session`). The enums live in
`src/lib/domain.ts`, which is shared with the client and also holds `PRIVACY_POLICY_VERSION`.

```
users                      // unique email index
  _id, email (lowercased), passwordHash, createdAt, updatedAt
  fitnessAssessment?: { averageDailySteps: int, hikesLast3Years: int, level: LOW|MEDIUM|HIGH, completedDate }
  consents: [{ version, givenAt, withdrawn: bool, withdrawnAt? }]

items                      // the user's inventory; index { userId, name } with Lithuanian collation (LT_COLLATION)
  _id, userId, name, category: ItemCategory, suitability: Temperature[]
  attributes: [{ name, value }]   // value '' = a tag that means "taip": "neperšlampamas" = "neperšlampamas: taip"
                                  // (attributeValue() stores a typed "taip"/"true"/"yes" as '')

hikes                      // trip + generated plan = trip history; index { userId, createdAt: -1 }
  _id, userId, location, departureDate, returnDate, season: Season, createdAt, updatedAt
  plan?: {                 // appears once recommendations are generated
    request: { createdAt, sentContent, usedItemIds[] }
    recommendations: {
      difficulty: HikeDifficulty, feasibility, fitnessComparison, weather, clothing,
      locationDescription?,   // omitted when there is no reliable info about the place
      generatedAt,
      items: [{ _id, name, category, explanation, owned: bool, inventoryItemId?,
                priority?: REQUIRED|RECOMMENDED,   // missing items only (Būtinas/Rekomenduojamas)
                purchased: bool }]                 // "Įsigyta"; also adds the item to the inventory
    }
  }

sessions                   // TTL index on expiresAt: MongoDB deletes expired sessions itself
  _id: SHA-256 of the cookie token (raw token never stored), userId, expiresAt

ItemCategory  = FOOTWEAR | CLOTHING | SLEEP | NAVIGATION | MEDICINE | FOOD | TOOLS | OTHER
Temperature   = COLD | WARM | HOT
Season        = WINTER | SPRING | SUMMER | AUTUMN
HikeDifficulty= EASY | MEDIUM | HARD
FitnessLevel  = LOW | MEDIUM | HIGH   (UI: žemas / vidutinis / aukštas)
```

- Deleting a user deletes their `items`, `hikes` and `sessions` too (composition). There's no DB cascade, so do it in code.
- A history entry stores recommendations **as generated**. Never regenerate when reopening.
- Dates without a time (departure/return) are stored as UTC midnight and shown as `YYYY-MM-DD`.
- Email uniqueness is enforced by the index: check before inserting, and also handle the duplicate-key error (E11000).

**Auth (built, `src/lib/server/auth.ts`):** server-side sessions, not JWT.
- Login generates a random token with `node:crypto`. The `session` cookie holds the token (httpOnly, SameSite=Lax,
  Secure outside plain-HTTP localhost, 30 days), and the `sessions` collection stores only its SHA-256 hash with `expiresAt`.
- `src/hooks.server.ts` `handle` puts the user in `locals.user` (`{ id, email } | null`). Logout and account deletion
  delete the session rows, so they take effect immediately.
- **Every protected form action calls `requireUser(locals)`.** Layout guards don't run before actions.
- Passwords: `hashPassword` / `verifyPassword` in `src/lib/server/password.ts` (scrypt, OWASP cost). Never store or log
  plain passwords. Login checks unknown emails against a dummy hash, so both failure cases take the same time.
- Rules and messages for registration live in `src/lib/validation.ts`.

**Routes:**

| Route | Who | What |
|---|---|---|
| `/` | visitors | landing page; logged-in users are redirected to `/plan`; `/?deleted` shows "account deleted" |
| `(auth)/login`, `(auth)/register` | visitors | UC-1 + UC-12 consent; logged-in users are redirected to `/plan` |
| `(app)/plan` | logged in | UC-6: the open trip's summary ("Keisti", disabled "Generuoti rekomendacijas"), or the trip form (`?/save`) when there is none |
| `(app)/inventory` | logged in | bright "Pridėti daiktą" button opens a `<dialog>`: UC-2 text form (`?/create`, duplicate warning) with "Pridėti iš nuotraukos" beside it (UC-3 `?/recognize` → "Generuoti" pre-fills the same text form; "Generuoti iš naujo" beside the photo sends `regenerate`) + UC-4 list with search/filter/sort in the browser, delete with a `<dialog>` (`?/delete`) |
| `(app)/inventory/preview` | logged in | `POST` a photo, get the WebP back: preview for photos the browser can't show (HEIC outside Safari) |
| `(app)/inventory/[id]` | logged in | UC-4 edit one item; someone else's id gets the same 404 as a missing one |
| `(app)/questionnaire` | logged in | fitness questionnaire: answers + assigned level, editable (UC-5). **Not in the header nav**: reached from `/account` ("Užpildyti klausimyną" / "Keisti atsakymus"), and the "Paskyra" nav link stays highlighted on it (team decision 2026-11-23, keeps the nav short). Link to it wherever UC-5 is offered (UC-7 2b). |
| `(app)/account` | logged in | email, fitness level + link to the questionnaire, "Ištrinti paskyrą" with a confirmation `<dialog>` (UC-9, action `?/delete`) |
| `/logout` | logged in | `POST` only (a form button in the app header) |

The `(app)` layout guards its pages and shows the header nav. Put new logged-in pages under `src/routes/(app)/`.

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
- Fields: name (required), category (from the list), other attributes ("Kiti požymiai") as tags, typed as "Požymis" +
  optional "Reikšmė" (`typedAttribute()`), one colour per attribute name with the same name grouped (`groupAttributes()` in
  `src/lib/validation.ts`, `.tag-hue`). Each tag is its own `attributes` form field, plus the `attributeName`/`attributeValue`
  pair still being typed; `readItemForm` joins them.
- While typing the name, suggest common hiking items. Name and "Požymis" use `src/lib/components/Combobox.svelte`
  (our own styled list under the field, not `<datalist>`, whose popup can't be styled and lands beside a modal `<dialog>`).
  "Požymis" suggests common names plus the ones already in the user's inventory.
- Empty name: highlight the field and don't save. Same name already in the inventory: warn about the duplicate and let the user save anyway or cancel.

### UC-3 Recognise item from photo (US-2, US-4, Vincentas, S1) FR-15–25
- "Įkelti iš galerijos" lets the user pick **one** photo. Accept JPG, PNG or HEIC ≤ 10 MB, otherwise show a clear error with the reason.
- Show a preview before sending, and let the user replace the photo. If gallery permission is missing, explain how to grant it.
- Send it to the local model, which returns name, category, attributes (e.g. colour, material, weight, or tags such as
  `neperšlampamas`, `sunkus`, `apsaugo_nuo_uodų`). **Result within 10 s** (NŠ-1).
  **Decided (team, 2026-11-23): wait up to 30 s** (`RECOGNITION_TIMEOUT_MS` in `src/lib/server/llama_api/recognition.ts`), because the local model is slower.
  An unreachable or busy model device (network error, HTTP 5xx) is retried once automatically. A timeout or a broken answer
  isn't (another 30 s, same answer): the user gets "Bandyti dar kartą".
- **Changed (Vincentas, 2026-11-24): no confidence %** (the spec's "below 70 %: Patikrinkite" is dropped). The pre-filled form
  always says the fields come from AI, which can misidentify the item or its attributes, and must be checked before saving.
- Not recognised: tip "photograph in a bright place, one item per frame" and offer manual add (UC-2 form).
- **Changed (Vincentas, 2026-11-24): the prompt and output format live on the model device.** Its chat template holds the
  system prompt and a GBNF grammar (`gear.gbnf`) forces a text answer: an English name, `Category:`, `Suitability:` (COLD/Warm/HOT)
  and per-category attribute lines (`waterproof = yes`, `ankle_support = high`, ...). The app sends **only the photo** (no
  prompt, no `response_format`, which would replace the grammar) and `parseRecognition` maps the answer to Lithuanian: names via
  `ITEM_TYPES` (unknown name → the model's English first line as is, often a brand like "Keen", until the grammar gets a fixed
  list of item names), attribute lines via `ATTRIBUTES` (unknown line → as the model wrote it). Untranslated English is a
  demo shortcut. **Change both together with the grammar.**
  Asked for Lithuanian, the 3B model made up words. The grammar has no photo verdict, so the photo hint gives the bright place /
  one item tip up front.
- "Generuoti iš naujo" (Vincentas, 2026-11-24): after a **successful** first recognition, the same photo can be regenerated up to
  5 times (`MAX_REGENERATIONS`). The server enforces it per user by a hash of the photo (in memory, never the photo), the page only
  shows the button then. It resends the same request at a higher temperature:
  llama-server still has the photo processed (prompt cache), so it takes ~3 s instead of ~20 s.
- Show attributes next to the photo. Each attribute can be **confirmed / edited / rejected**, the name is editable, and there's a
  "Patvirtinti visus" button. Rejecting the whole item saves nothing. **Only confirmed items enter the inventory.**
  **Changed (Vincentas, 2026-11-24):** no per-attribute review. A recognised item pre-fills the normal add form (attributes one
  per tag, removable, new ones via "Pridėti požymį") next to the photo, with the AI note. "Išsaugoti" confirms it,
  "Atšaukti" (closing the popup) rejects it and saves nothing.
- Photos are processed and discarded, **never stored**.
- HEIC: most browsers can't render it in `<img>` and llama-server can't read it, so the server converts it: WebP for the preview,
  PNG for the model (see Running).

### UC-4 View & manage inventory (US-10 Mantas, US-14 Naglis, S1) FR-26–30
- List all items with name, category and suitability tags. Sort by name, filter by category, search by name.
  Also filter by attribute ("Filtruoti pagal požymį"): only tags that exist in the inventory, grouped by name.
- Empty inventory: show a message with a "Pridėti daiktą" link.
- Edit name, category and attributes. "Išsaugoti" saves, "Atšaukti" leaves the item unchanged.
- Delete only after a confirmation dialog. Deleted items aren't used in **new** recommendations (history stays as it was).

### UC-5 Fitness questionnaire (US-6, Upyna, S2) FR-31–34
- A few questions (at least: average daily steps, mountain hikes in the last 3 years). Keep it short: too long scares
  users off, too short gives a bad estimate.
- All answers required. Unanswered questions are highlighted and the form can't be submitted.
- The backend (not the AI) assigns the level žemas / vidutinis / aukštas and shows it.
- The user can view and change answers later, and the level is recalculated.
- **Two questions only**, stored as `fitnessAssessment.averageDailySteps` and `hikesLast3Years`
  - Limits: 500–50 000 steps a day and 0–150 hikes in 3 years; other answers get an error next to the field.
  - Each answer gives 0–3 points: steps < 5 000 → 0, 5 000–7 999 → 1, 8 000–11 999 → 2, ≥ 12 000 → 3;
    hikes 0 → 0, 1–2 → 1, 3–5 → 2, ≥ 6 → 3. Sum 0–2 → LOW, 3–4 → MEDIUM, 5–6 → HIGH.
  - On purpose, one strong answer can't make up for a weak other one (fit but no mountain experience, or experienced
    but inactive, is MEDIUM at most): the app exists because beginners overestimate themselves.
  - Levels already saved are not recalculated; they update when the user submits the questionnaire again.
  - Rules and formula live in `src/lib/fitness.ts` (the page explains them too).

### UC-6 Trip details (US-7, US-8, Upyna, S2) FR-35–38
- Location as free text, required (error if missing), changeable before generating.
- Departure and return dates (`YYYY-MM-DD`). Departure ≥ today, return ≥ departure, clear error otherwise.
- Departure date far away: warn that the weather estimate may be inaccurate and may change.
- The backend computes duration (days) and season from the dates, saves the trip, and shows a summary with a "Generuoti rekomendacijas" button.
- Rules live in `src/lib/trip.ts`, DB access in `src/lib/server/trips.ts`:
  - "Far" departure date: more than 10 days from today → show the warning that the weather estimate may be inaccurate
    and may change (reliable forecasts reach ~7–10 days). "Today" is the date in Europe/Vilnius.
  - Season from the departure month: Dec–Feb WINTER, Mar–May SPRING, Jun–Aug SUMMER, Sep–Nov AUTUMN.
  - Duration counts both ends: a one-day hike is 1 day.
  - Location: max 200 characters.
  - A user has **at most one open trip** (a hike without `plan`). "Išsaugoti" saves it and `/plan` shows its summary
    (location, dates, duration, season, far-date warning) with "Keisti" (back to the filled form, updates the same trip)
    and "Generuoti rekomendacijas". With no open trip, `/plan` shows an empty form. Trips with `plan` belong to the
    trip history (UC-11) and are never edited.
  - "Generuoti rekomendacijas" is disabled with the note "Rekomendacijų generavimas dar kuriamas." until UC-7 is built.
    UC-7 enables it and generates the plan for the open trip, which then moves to the history.

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

## Styling

- One global stylesheet: `src/app.css` (imported in `src/routes/+layout.svelte`). Use its tokens (`--c-*`, `--space-*`,
  `--text-*`, `--radius-*`) and classes. Don't hard-code colours or invent per-page buttons.
- Base elements are already styled: headings, text, lists, tables, forms, `<dialog>`, `<details>`.
- Shared classes:
  - `.button` with `-secondary`, `-ghost`, `-danger`, `-large`, `-cta`. A plain `<button>` is primary by default.
    `-cta` is the bright green "add" action (`--c-cta`): the page's one main call to action and the submit buttons of its popup.
  - `.field`, `.field-hint`, `.field-error` for form fields.
  - `.tag` with `-primary`, `-warning`, `-danger`, `-success` (Būtinas, Rekomenduojamas).
  - `.notice` with `-warning`, `-danger`, `-success` (disclaimers, errors).
  - `.panel`, `.spinner`, `.container`, `.visually-hidden`.
- Theme: colours use `light-dark()` and follow the OS by default. A theme toggle sets `data-theme="light"|"dark"` on `<html>`.
- Palette: spruce green primary, cool mist background, lichen accent **only on dark forest surfaces**, red **only for danger**.
- Font: Archivo Variable, self-hosted via `@fontsource-variable/archivo` (no Google Fonts CDN, because of GDPR and slow networks).
  Headings are condensed (`font-stretch: var(--stretch-display)`), like trail signposts.
- The landing page (`src/routes/+page.svelte`) shows the app's 4 steps as waypoints on a mountain trail. Keep that the
  only decorative moment, and keep other pages quiet.

## LLM notes (Anthropic, Claude Opus 5.5)

- Package `@anthropic-ai/sdk`, model ID `claude-opus-5-5` (exact string, no date suffix). Read `ANTHROPIC_API_KEY` from env, server side only.
- Use **structured outputs** (`output_config.format` / `client.messages.parse()`) so the reply maps straight to the
  `recommendations` shape. Still validate it before saving.
- Opus 5.5: thinking is always on. Don't send `thinking: {type: "disabled"}` or `budget_tokens` (400). Tune depth with
  `output_config.effort` (default `medium`). No assistant prefill, no forced `tool_choice` (`any`/`tool` returns 400).
- Check `stop_reason` (handle `"refusal"`, `"max_tokens"`) before reading content. Use the SDK's typed errors
  (`Anthropic.RateLimitError`, `Anthropic.APIError`, ...) for the retry UX.
- Send only what's needed: trip details, fitness level, inventory. **Never** email, password or user IDs.
  An item attribute without a value is a "yes" ("neperšlampamas" = waterproof), so say so in the prompt.
- Write the prompt in a way that makes the model answer in Lithuanian, state missing data explicitly, and not invent facts.

## Conventions & workflow

- ESLint and `svelte-check` must pass. English identifiers, Lithuanian UI text.
- Imports use the `#lib/...` alias (SvelteKit 3, no `$lib`) **with the `.ts` extension**, e.g. `#lib/server/models.ts`.
  That way `scripts/*.ts` run with plain `node` (Node 24 strips types), so use const arrays, never TS `enum`.
- Route paths are English (`/register`, `/login`). Internal links and redirects go through `resolve()` from `$app/paths`
  (ESLint `svelte/no-navigation-without-resolve`). In SvelteKit 3 it takes the **route ID including groups**:
  `resolve('/(auth)/login')` gives `/login`. The route must exist or the type check fails.
- Git: **everything has to be committed**. Don't leave work uncommitted.
  - Work on `feature/{feature_name}` branches created from `develop`. When the feature is done, merge it into `develop`.
  - Code reaches `main` only via a reviewed pull request from `develop`.
  - **No AI attribution in git**: no `Co-Authored-By: Claude …` trailer and no "Generated with Claude Code" line in
    commit messages, merge commits or pull request descriptions.
- Never commit secrets. New env vars go into `.env.example` without values.

## Open decisions (not in the spec — decide, then record the answer here)

1. **Local vision model**: runs `ggml-org/Qwen2.5-VL-3B-Instruct-GGUF` (llama-server at `LLAMA_URL`, API key `LLAMA_API_KEY`).
   Prompt, chat template and grammar on the model device; the answer parser in `src/lib/server/llama_api/recognition.ts`
   (see UC-3). The test below was with the earlier JSON prompt. Still open: model choice final? Real test
   (2026-11-24, 1 slot, 4096 ctx): a new photo ~20 s (mostly the image step; a 12 MP JPEG took 29.5 s, near the 30 s timeout),
   the same photo again ~3 s. With the English options it named boots, sleeping bag, tent and torch right and caught blurry and
   dark photos, but missed a photo with three items and called a landscape "BLURRY". A longer prompt with app context made it worse.
2. **PDF library** (must keep output ≤ 1 MB).
3. **Spec conflict**: UC-12's privacy text lists item photos as sent to the external AI, but the architecture keeps photos
   on the local model. The registration text already follows the architecture.
4. **Not built yet from UC-12**: withdrawing consent in account settings (FR-10), and making users re-accept when
   `PRIVACY_POLICY_VERSION` changes (sequence diagram 18). Both are needed before the AI features (UC-3, UC-7) send any data.
5. **Login rate limiting / lockout** is not in the spec and not built.
