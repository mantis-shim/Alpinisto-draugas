<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import { attributeText, fold, groupAttributes, itemFormValues } from '#lib/validation.ts';
	import {
		CATEGORY_LABELS,
		ITEM_CATEGORIES,
		PHOTO_MAX_BYTES,
		RECOGNITION_CHECK_BELOW,
		TEMPERATURE_LABELS,
		type InventoryItem
	} from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let deleteDialog: HTMLDialogElement;
	let toDelete: InventoryItem | undefined = $state();

	// UC-2 + UC-3 in one popup: the text form by default, "Pridėti iš nuotraukos" beside it. A recognised item
	// pre-fills the same text form (team decision 2026-11-24, replaces the per-attribute review).
	let addDialog: HTMLDialogElement;
	let addForm: HTMLFormElement;
	let mode: 'text' | 'photo' = $state('text');
	let ai: { confidence: number } | null = $state(null); // set while the text form holds what the model recognised
	const emptyValues = { name: '', category: '', suitability: [], attributes: '' };
	const addValues = $derived(
		form?.values ?? (form?.recognized ? itemFormValues({ suitability: [], ...form.recognized }) : emptyValues)
	);
	let recognizing = $state(false); // the model can take up to 30 s

	// FR-17: preview the chosen photo before it is sent; picking another one replaces it
	let photoInput: HTMLInputElement;
	let preview = $state(''); // object URL, only in this browser
	let previewFile: File | undefined; // the photo behind `preview`, until the server has had to convert it
	let converting = $state(false);
	// Message from the browser's own checks; '' hides the server's old one once a new photo is picked
	let photoNote: string | undefined = $state();
	const photoError = $derived(photoNote ?? form?.photoError);
	const retry = $derived(photoNote === undefined && !!form?.retry);
	let galleryHelp = $state(false);

	function showPhoto(file: File | undefined) {
		URL.revokeObjectURL(preview);
		preview = '';
		previewFile = file;
		converting = false;
		photoNote = '';
		if (!file) return;
		// FR-16 before uploading: saves a long wait on a slow connection
		if (file.size > PHOTO_MAX_BYTES) {
			photoNote = 'Nuotrauka per didelė. Įkelk nuotrauką iki 10 MB.';
			photoInput.value = '';
		} else preview = URL.createObjectURL(file);
	}
	// The browser can't show this photo (HEIC outside Safari), so the server converts it.
	async function convertPreview() {
		const file = previewFile;
		previewFile = undefined; // once: a WebP that still won't show isn't retried
		if (!file) return;
		converting = true;
		const body = new FormData();
		body.set('photo', file);
		let url = '';
		let note = 'Nepavyko parodyti nuotraukos. Patikrink ryšį ir pasirink ją dar kartą.';
		try {
			const response = await fetch(resolve('/(app)/inventory/preview'), { method: 'POST', body });
			if (response.ok) url = URL.createObjectURL(await response.blob());
			else if (response.status === 400) note = await response.text(); // e.g. not a photo at all
		} catch {
			// offline: the note above says so
		}
		if (photoInput.files?.[0] !== file) return URL.revokeObjectURL(url); // another photo was picked meanwhile
		converting = false;
		preview = url;
		if (!url) {
			photoNote = note;
			photoInput.value = '';
		}
	}

	// Closing the popup (Atšaukti, ✕, Esc, or after saving) drops the draft: a recognised item that wasn't saved is
	// gone (FR-25), and the next item starts from the text form.
	// ponytail: mode switching needs JS. Without it the popup still opens (command attributes) with the text form only.
	async function resetAdd() {
		mode = 'text';
		ai = null;
		galleryHelp = false;
		photoInput.value = '';
		showPhoto(undefined);
		addForm.reset();
		// forget errors and the recognised item, but keep "pridėtas" after a save (`location` only matters for redirects)
		if (form?.values || form?.recognized || form?.photoError || form?.notRecognized) {
			await applyAction({ type: 'success', status: 200, location: location.href });
		}
	}

	// FR-27: search, filter and sort in the browser, so a slow connection costs no extra requests
	let query = $state('');
	let category = $state('');
	let tag = $state(''); // a tag from the inventory, by tagKey()
	let sort = $state('asc');
	const tagKey = (a: { name: string; value: string }) => fold(attributeText(a)); // "Spalva: Ruda" = "spalva: ruda"
	// Every tag in the inventory once. For the filter: grouped by name (<optgroup>), A–Ž, tags without a value last.
	const inventoryTags = $derived(new Map(data.items.flatMap((i) => i.attributes).map((a) => [tagKey(a), a])));
	const tagGroups = $derived(
		Map.groupBy(
			[...inventoryTags.values()].toSorted(
				(a, b) => Number(!a.value) - Number(!b.value) || attributeText(a).localeCompare(attributeText(b), 'lt')
			),
			(a) => (a.value ? fold(a.name) : '')
		)
	);
	const tagFilter = $derived(inventoryTags.has(tag) ? tag : ''); // a tag whose last item was deleted stops filtering
	const shown = $derived.by(() => {
		const q = fold(query.trim());
		const items = data.items.filter(
			(i) =>
				(!category || i.category === category) &&
				(!tagFilter || i.attributes.some((a) => tagKey(a) === tagFilter)) &&
				fold(i.name).includes(q)
		);
		return sort === 'desc' ? items.reverse() : items; // the server sorts A–Ž; filter() already made a copy
	});
</script>

<svelte:head><title>Inventorius – Alpinisto draugas</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Inventorius</h1>
		<p>Surašyk turimą ekipuotę. Rekomendacijose pasakysime, ką pasiimti iš inventoriaus ir ko trūksta.</p>
	</div>
	<button class="button-cta button-large" command="show-modal" commandfor="add-dialog">
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
		Pridėti daiktą
	</button>
</div>

{#if form?.created}
	<p class="notice notice-success" role="status">Daiktas „{form.created}“ pridėtas į inventorių.</p>
{/if}
{#if form?.deleted}
	<p class="notice notice-success" role="status">Daiktas ištrintas iš inventoriaus.</p>
{/if}
{#if form?.missing}
	<p class="notice notice-danger" role="alert">Šio daikto inventoriuje nebėra.</p>
{/if}
{#if data.items.length === 0}
	<div class="notice empty" role="status">
		<p>Inventoriuje dar nėra daiktų.</p>
		<button class="button-secondary" command="show-modal" commandfor="add-dialog">Pridėti daiktą</button>
	</div>
{/if}

<dialog id="add-dialog" class="add-dialog" bind:this={addDialog} aria-labelledby="add-title" onclose={resetAdd}>
	<div class="add-head">
		<h2 id="add-title">{mode === 'photo' ? 'Pridėti iš nuotraukos' : 'Pridėti daiktą'}</h2>
		<button type="button" class="button-ghost close" command="close" commandfor="add-dialog" aria-label="Uždaryti">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
		</button>
	</div>

	<div class="add-body">
		<!-- the other way to add: beside the form on wide screens, above it on phones -->
		<aside class="add-side">
			{#if mode === 'text'}
				{#if ai && preview}<img src={preview} alt="Nuotrauka, iš kurios užpildyti laukai" />{/if}
				<p>
					{ai
						? 'Ne tas daiktas? Įkelk kitą nuotrauką.'
						: 'Turi nuotrauką? Dirbtinis intelektas atpažins daiktą ir užpildys laukus už tave.'}
				</p>
				<button type="button" onclick={() => (mode = 'photo')}>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
					</svg>
					{ai ? 'Kita nuotrauka' : 'Pridėti iš nuotraukos'}
				</button>
			{:else}
				<p>Nori įvesti pats? Užpildyk laukus ranka.</p>
				<button type="button" onclick={() => (mode = 'text')}>Įvesti ranka</button>
			{/if}
		</aside>

		<!-- UC-3: one photo; the server checks type and size and converts it -->
		<form
			hidden={mode !== 'photo'}
			method="POST"
			action="?/recognize"
			enctype="multipart/form-data"
			novalidate
			use:enhance={() => {
				recognizing = true;
				photoNote = undefined; // show what the server says about this attempt
				return async ({ update }) => {
					await update({ reset: false }); // keep the photo for a retry or another look
					recognizing = false;
					if (!form?.recognized) return;
					ai = { confidence: form.recognized.confidence };
					mode = 'text';
					setTimeout(() => document.getElementById('item-name')?.focus()); // after SvelteKit's focus reset
				};
			}}
		>
			{#if form?.notRecognized}
				<p class="notice notice-warning" role="status">
					Daikto atpažinti nepavyko. Fotografuok šviesioje vietoje, po vieną daiktą kadre, arba įvesk daiktą ranka.
				</p>
			{/if}
			<div class="field">
				<label for="item-photo">Įkelti iš galerijos</label>
				<input
					bind:this={photoInput}
					id="item-photo"
					name="photo"
					type="file"
					accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
					aria-invalid={photoError ? 'true' : undefined}
					aria-describedby={photoError ? 'item-photo-hint item-photo-error' : 'item-photo-hint'}
					onchange={(e) => showPhoto(e.currentTarget.files?.[0])}
					oncancel={() => (galleryHelp = true)}
				/>
				<p class="field-hint" id="item-photo-hint">JPG, PNG arba HEIC iki 10 MB. Vienoje nuotraukoje – vienas daiktas.</p>
				{#if photoError}<p class="field-error" id="item-photo-error">{photoError}</p>{/if}
			</div>
			{#if preview}
				<figure class="preview">
					{#if converting}
						<p class="field-hint"><span class="spinner" aria-hidden="true"></span> Ruošiama peržiūra…</p>
					{:else}
						<img src={preview} alt="Pasirinkta nuotrauka" onerror={convertPreview} />
					{/if}
					<figcaption class="field-hint">Ne ta nuotrauka? Pasirink kitą – ji pakeis šią.</figcaption>
				</figure>
			{/if}
			<!-- FR-18 -->
			<!-- ponytail: a page can't ask whether gallery access was denied. A closed picker ("cancel") is the closest
			     signal, so it opens this help; the help is always one tap away for pickers that never open at all. -->
			<details class="gallery-help" bind:open={galleryHelp}>
				<summary>Neatsidaro galerija?</summary>
				<p>
					Gali būti, kad naršyklė neturi leidimo naudotis nuotraukomis. Suteik jį telefono nustatymuose ir pasirink
					nuotrauką dar kartą:
				</p>
				<ul>
					<li>
						<strong>Android:</strong> „Nustatymai“ → „Programos“ → tavo naršyklė (pvz., Chrome) → „Leidimai“ →
						„Nuotraukos ir vaizdo įrašai“ (senesniuose telefonuose – „Saugykla“) → „Leisti“.
					</li>
					<li>
						<strong>iPhone:</strong> „Nustatymai“ → „Programos“ → tavo naršyklė (pvz., Safari ar Chrome) →
						„Nuotraukos“ arba „Kamera“ → „Leisti“.
					</li>
				</ul>
				<p>Jei vis tiek nepavyksta, įvesk daiktą ranka.</p>
			</details>
			<div class="actions">
				<button class="button-cta" disabled={recognizing || converting || !preview}>
					{#if recognizing}<span class="spinner" aria-hidden="true"></span> Atpažįstama…
					{:else if retry}Bandyti dar kartą{:else}Generuoti{/if}
				</button>
				<button type="button" class="button-ghost" command="close" commandfor="add-dialog">Atšaukti</button>
			</div>
		</form>

		<!-- UC-2, also the review of a recognised item. novalidate: the server checks everything and answers in Lithuanian -->
		<form
			hidden={mode !== 'text'}
			bind:this={addForm}
			method="POST"
			action="?/create"
			novalidate
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') addDialog.close(); // resetAdd does the rest
				}}
		>
			{#if ai}
				<p class="notice" role="status">
					Laukus užpildė dirbtinis intelektas (tikrumas {ai.confidence} %). Patikrink ir pataisyk juos: į inventorių
					daiktas pateks tik paspaudus „Išsaugoti“.
					{#if ai.confidence < RECOGNITION_CHECK_BELOW}<span class="tag tag-warning">Patikrinkite</span>{/if}
				</p>
			{/if}
			{#if form?.duplicate}
				<p class="notice notice-warning" role="alert">
					Daiktas „{form.values.name}“ inventoriuje jau yra. Vis tiek pridėti dar vieną?
				</p>
			{/if}
			<ItemFields
				values={addValues}
				errors={form?.errors ?? {}}
				attributeNames={[...inventoryTags.values()].map((a) => a.name)}
			/>
			<div class="actions">
				{#if form?.duplicate}
					<button class="button-cta" name="duplicateOk" value="1">Išsaugoti vis tiek</button>
				{:else}
					<button class="button-cta">Išsaugoti</button>
				{/if}
				<button type="button" class="button-ghost" command="close" commandfor="add-dialog">Atšaukti</button>
			</div>
		</form>
	</div>
</dialog>

{#if data.items.length}
	<search class="toolbar">
		<div class="field query">
			<label for="filter-query">Ieškoti pagal pavadinimą</label>
			<input id="filter-query" type="search" autocomplete="off" bind:value={query} />
		</div>
		<div class="field">
			<label for="filter-category">Filtruoti pagal kategoriją</label>
			<select id="filter-category" bind:value={category}>
				<option value="">Visos kategorijos</option>
				{#each ITEM_CATEGORIES as c (c)}<option value={c}>{CATEGORY_LABELS[c]}</option>{/each}
			</select>
		</div>
		<div class="field">
			<label for="filter-tag">Filtruoti pagal požymį</label>
			<select id="filter-tag" bind:value={tag}>
				<option value="">Visi požymiai</option>
				{#each [...tagGroups] as [group, attributes] (group)}
					<optgroup label={group ? attributes[0].name : 'Be reikšmės (taip)'}>
						{#each attributes as attribute (tagKey(attribute))}
							<!-- full text: the closed <select> shows only the option, and "ruda" alone says little -->
							<option value={tagKey(attribute)}>{attributeText(attribute)}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="filter-sort">Rūšiuoti pagal pavadinimą</label>
			<select id="filter-sort" bind:value={sort}>
				<option value="asc">A–Ž</option>
				<option value="desc">Ž–A</option>
			</select>
		</div>
	</search>

	<p class="count" role="status">
		{shown.length === data.items.length
			? `Daiktų: ${shown.length}`
			: `Rasta: ${shown.length} iš ${data.items.length}`}
	</p>

	{#if shown.length === 0}
		<p class="notice">Daiktų nerasta. Pakeisk paieškos žodį, kategoriją arba požymį.</p>
	{/if}

	<ul class="items">
		{#each shown as item (item.id)}
			<li class="panel" id="item-{item.id}">
				<h2>{item.name}</h2>
				<p class="tags">
					<span class="tag tag-primary">{CATEGORY_LABELS[item.category]}</span>
					{#each item.suitability as temperature (temperature)}
						<span class="tag">{TEMPERATURE_LABELS[temperature]}</span>
					{/each}
				</p>
				{#if item.attributes.length}
					<p class="tags">
						{#each groupAttributes(item.attributes) as { attribute, hue } (attribute)}
							<span class="tag" class:tag-hue={hue !== undefined} style:--hue={hue}>{attributeText(attribute)}</span>
						{/each}
					</p>
				{/if}
				<div class="actions">
					<a class="button button-secondary" href={resolve('/(app)/inventory/[id]', { id: item.id })}>
						Redaguoti<span class="visually-hidden"> „{item.name}“</span>
					</a>
					<button
						class="button-ghost"
						type="button"
						onclick={() => {
							toDelete = item;
							deleteDialog.showModal();
						}}
					>
						Ištrinti<span class="visually-hidden"> „{item.name}“</span>
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<dialog bind:this={deleteDialog} aria-labelledby="delete-title">
	<h2 id="delete-title">Ištrinti daiktą?</h2>
	<p>
		Daiktas <strong>„{toDelete?.name}“</strong> bus ištrintas iš inventoriaus. Šio veiksmo atšaukti
		negalima. Jau sugeneruotos rekomendacijos nepasikeis.
	</p>
	<div class="actions dialog-actions">
		<form method="dialog">
			<button class="button-secondary">Atšaukti</button>
		</form>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					deleteDialog.close();
				}}
		>
			<input type="hidden" name="id" value={toDelete?.id} />
			<button class="button-danger">Ištrinti</button>
		</form>
	</div>
</dialog>

<style>
	.page-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	.page-head p {
		margin: 0;
	}
	.page-head > button {
		flex: 1 1 100%; /* full width on phones: the main action of the page */
	}
	@media (min-width: 40rem) {
		.page-head > button {
			flex: none;
		}
	}
	button svg {
		width: 1.25em;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.empty {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.empty p {
		margin: 0;
	}

	/* The add popup: wide enough for the form plus the photo option beside it */
	.add-dialog {
		width: min(54rem, calc(100vw - 1rem));
		max-height: calc(100dvh - 1rem);
		padding: var(--space-4);
		border-top: 6px solid var(--c-cta);
	}
	.add-dialog[open] {
		animation: pop-in 0.18s ease-out;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			translate: 0 0.75rem;
			scale: 0.98;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.add-dialog[open] {
			animation: none;
		}
	}
	.add-dialog::backdrop {
		backdrop-filter: blur(3px);
	}
	@media (min-width: 40rem) {
		.add-dialog {
			padding: var(--space-6);
		}
	}
	.add-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.close {
		flex: none;
		width: 2.75rem;
		padding: 0;
	}
	.add-body {
		display: grid;
		gap: var(--space-5);
		align-items: start;
	}
	@media (min-width: 48rem) {
		.add-body {
			grid-template-columns: 1fr 17rem;
		}
		.add-side {
			grid-column: 2;
			grid-row: 1;
		}
	}
	.add-side {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--c-primary-soft);
		border-radius: var(--radius-l);
	}
	.add-side p {
		margin: 0;
		font-size: var(--text-s);
	}
	.add-side img {
		max-height: 12rem;
		margin-inline: auto;
		border-radius: var(--radius-m);
	}
	.preview {
		margin: 0 0 var(--space-3);
	}
	.preview img {
		max-height: 16rem;
		border-radius: var(--radius-m);
	}
	.gallery-help {
		margin-bottom: var(--space-4);
		font-size: var(--text-s);
	}

	.toolbar {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: var(--space-3);
		align-items: end; /* controls stay level when a label wraps */
	}
	.query {
		grid-column: 1 / -1;
	}
	@media (min-width: 48rem) {
		.toolbar {
			grid-template-columns: 2fr 1fr 1fr 1fr;
		}
		.query {
			grid-column: auto;
		}
	}
	.count {
		font-size: var(--text-s);
		color: var(--c-text-muted);
	}
	.items {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
		gap: var(--space-3);
		padding: 0;
		list-style: none;
	}
	.items li {
		display: flex;
		flex-direction: column;
		margin: 0;
		scroll-margin-top: var(--space-4);
	}
	.items .actions {
		margin-top: auto; /* buttons line up along the bottom of each row */
	}
	.items h2 {
		margin-bottom: var(--space-2);
		font-size: var(--text-xl);
	}
	dialog h2 {
		font-size: var(--text-2xl);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.dialog-actions {
		justify-content: flex-end;
	}
</style>
