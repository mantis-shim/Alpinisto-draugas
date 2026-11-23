<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import { attributeText, itemFormValues } from '#lib/validation.ts';
	import {
		CATEGORY_LABELS,
		ITEM_CATEGORIES,
		ITEM_LIMITS,
		PHOTO_MAX_BYTES,
		RECOGNITION_CHECK_BELOW,
		TEMPERATURE_LABELS,
		type InventoryItem
	} from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let deleteDialog: HTMLDialogElement;
	let toDelete: InventoryItem | undefined = $state();

	const emptyValues = { name: '', category: '', suitability: [], attributes: '' };
	// open while the inventory is empty or the last submit needs fixing; bound, so a re-render never shuts it on the user
	let addOpen = $derived(
		data.items.length === 0 || !!(form?.values || form?.photoError || form?.notRecognized || form?.recognized)
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
	function clearPhoto() {
		photoInput.value = '';
		showPhoto(undefined);
	}
	// The browser can't show this photo (HEIC outside Safari), so the server converts it, as it will for the model.
	// ponytail: such a photo is uploaded twice (preview + recognition). Send the WebP for recognition if that hurts.
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

	// UC-3 review (FR-21–23): each recognised attribute is confirmed, edited or rejected, and only confirmed ones are
	// saved. ponytail: the review lives in the browser, so it needs JS (like the preview). Without JS the
	// recognised item just pre-fills the normal form below.
	type ReviewAttribute = {
		name: string;
		value: string;
		status: 'pending' | 'confirmed' | 'rejected';
		draft?: { name: string; value: string }; // being edited
	};
	let review = $state<{ confidence: number; attributes: ReviewAttribute[] } | null>(null);
	let reviewTried = $state(false); // "Išsaugoti" was pressed before every attribute was decided
	const undecided = $derived(review?.attributes.filter((a) => a.draft || a.status === 'pending') ?? []);
	const addValues = $derived(
		form?.values ?? (form?.recognized ? itemFormValues({ suitability: [], ...form.recognized }) : emptyValues)
	);

	function finishEdit(attribute: ReviewAttribute) {
		const { draft } = attribute;
		const name = draft?.name.replaceAll(':', '').trim(); // ":" separates name and value when saved
		if (draft && name) {
			attribute.name = name;
			attribute.value = draft.value.trim();
			attribute.status = 'confirmed'; // editing it is confirming it
		}
		attribute.draft = undefined;
	}
	async function discardReview() {
		review = null;
		reviewTried = false;
		clearPhoto();
		// forget the recognised item and any warning about it (`location` only matters for redirects)
		await applyAction({ type: 'success', status: 200, location: location.href });
		addOpen = true; // stay here: try another photo or add the item by hand
		setTimeout(() => photoInput.focus()); // after SvelteKit's own focus reset, which also ends in a timeout
	}

	// FR-27: search, filter and sort in the browser, so a slow connection costs no extra requests
	let query = $state('');
	let category = $state('');
	let sort = $state('asc');
	// "zygio" finds "Žygio batai": phone keyboards often skip the Lithuanian letters
	const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
	const shown = $derived.by(() => {
		const q = fold(query.trim());
		const items = data.items.filter((i) => (!category || i.category === category) && fold(i.name).includes(q));
		return sort === 'desc' ? items.reverse() : items; // the server sorts A–Ž; filter() already made a copy
	});
</script>

<svelte:head><title>Inventorius – Alpinisto draugas</title></svelte:head>

<h1>Inventorius</h1>
<p>Surašyk turimą ekipuotę. Rekomendacijose pasakysime, ką pasiimti iš inventoriaus ir ko trūksta.</p>

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
	<p class="notice" role="status">Inventoriuje dar nėra daiktų. <a href="#add-item">Pridėti daiktą</a></p>
{/if}

<details bind:open={addOpen}>
	<summary>Pridėti daiktą</summary>
	<!-- UC-3: one photo; the server checks type and size and converts it. Hidden while its result is reviewed. -->
	<form
		method="POST"
		action="?/recognize"
		enctype="multipart/form-data"
		novalidate
		hidden={!!review}
		use:enhance={() => {
			recognizing = true;
			photoNote = undefined; // show what the server says about this attempt
			return async ({ update }) => {
				await update({ reset: false }); // keep the photo for a retry or another look
				recognizing = false;
				if (!form?.recognized) return;
				const { confidence, attributes } = form.recognized;
				review = { confidence, attributes: attributes.map((a): ReviewAttribute => ({ ...a, status: 'pending' })) };
				reviewTried = false;
			};
		}}
	>
		{#if form?.notRecognized}
			<p class="notice notice-warning" role="status">
				Daikto atpažinti nepavyko. Fotografuok šviesioje vietoje, po vieną daiktą kadre, arba pridėk daiktą
				ranka žemiau.
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
			<p>Jei vis tiek nepavyksta, pridėk daiktą ranka žemiau.</p>
		</details>
		<button class="button-secondary" disabled={recognizing || converting}>
			{#if recognizing}<span class="spinner" aria-hidden="true"></span> Atpažįstama…
			{:else if retry}Bandyti dar kartą{:else}Atpažinti{/if}
		</button>
	</form>

	<!-- novalidate: the server checks everything and answers in Lithuanian -->
	<form
		id="add-item"
		class:wide={review}
		method="POST"
		action="?/create"
		novalidate
		use:enhance={({ formData, cancel }) => {
			if (review) {
				if (formData.has('confirmAll')) {
					// everything not rejected; an open edit keeps what the user typed
					for (const attribute of review.attributes) {
						if (attribute.draft) finishEdit(attribute);
						if (attribute.status === 'pending') attribute.status = 'confirmed';
					}
				}
				if (undecided.length) {
					reviewTried = true;
					cancel();
					return;
				}
				// only confirmed attributes enter the inventory (UC-3)
				const confirmed = review.attributes.filter((a) => a.status === 'confirmed');
				formData.set('attributes', confirmed.map(attributeText).join('\n'));
			}
			return async ({ result, update }) => {
				await update();
				if (result.type !== 'success') return;
				review = null; // saved: the next item starts from scratch
				clearPhoto();
			};
		}}
	>
		{#if review}
			<!-- the photo next to what was recognised in it -->
			<div class="review">
				{#if preview}<img src={preview} alt="Nuotrauka, kurioje atpažintas daiktas" />{/if}
				<div>
					<p class="notice" role="status">
						Daiktą atpažino dirbtinis intelektas (tikrumas {review.confidence} %). Patikrink pavadinimą, kategoriją ir
						požymius: į inventorių pateks tik tai, ką patvirtinsi.
						{#if review.confidence < RECOGNITION_CHECK_BELOW}<span class="tag tag-warning">Patikrinkite</span>{/if}
					</p>
					{@render itemForm()}
				</div>
			</div>
		{:else}
			{@render itemForm()}
		{/if}
	</form>
</details>

{#snippet itemForm()}
	{#if form?.duplicate}
		<p class="notice notice-warning" role="alert">
			Daiktas „{form.values.name}“ inventoriuje jau yra. Vis tiek pridėti dar vieną?
		</p>
	{/if}
	<ItemFields values={addValues} errors={form?.errors ?? {}} attributes={review ? reviewAttributes : undefined} />
	<div class="actions">
		{#if form?.duplicate}
			<button name="duplicateOk" value="1">Išsaugoti vis tiek</button>
		{:else if review}
			<button name="confirmAll" value="1">Patvirtinti visus</button>
			<button class="button-secondary">Išsaugoti</button>
		{:else}
			<button>Išsaugoti</button>
		{/if}
		{#if review}
			<!-- rejecting the whole item saves nothing -->
			<button type="button" class="button-ghost" onclick={discardReview}>Atmesti daiktą</button>
		{:else if form?.duplicate}
			<a class="button button-secondary" href={resolve('/(app)/inventory')}>Atšaukti</a>
		{/if}
	</div>
{/snippet}

{#snippet reviewAttributes()}
	{#if review}
		<fieldset class="review-attributes">
			<legend>Kiti požymiai</legend>
			{#if review.attributes.length}
				<p class="field-hint">Patvirtink, pataisyk arba atmesk kiekvieną požymį.</p>
			{:else}
				<p class="field-hint">Kitų požymių nuotraukoje neatpažinta.</p>
			{/if}
			<ul>
				{#each review.attributes as attribute, i (i)}
					{@const text = attributeText(attribute)}
					<li class:undecided={reviewTried && (attribute.draft || attribute.status === 'pending')}>
						{#if attribute.draft}
							<div class="field">
								<label for="review-name-{i}">Požymis</label>
								<input
									id="review-name-{i}"
									maxlength={ITEM_LIMITS.attributeText}
									bind:value={attribute.draft.name}
									onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), finishEdit(attribute))}
									{@attach (input) => input.focus()}
								/>
							</div>
							<div class="field">
								<label for="review-value-{i}">Reikšmė (neprivaloma)</label>
								<input
									id="review-value-{i}"
									maxlength={ITEM_LIMITS.attributeText}
									bind:value={attribute.draft.value}
									onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), finishEdit(attribute))}
								/>
							</div>
							<div class="actions">
								<button
									type="button"
									class="button-secondary"
									disabled={!attribute.draft.name.trim()}
									onclick={() => finishEdit(attribute)}>Patvirtinti</button
								>
								<button type="button" class="button-ghost" onclick={() => (attribute.draft = undefined)}>
									Atšaukti
								</button>
							</div>
						{:else}
							<p>
								<span class:rejected={attribute.status === 'rejected'}>{text}</span>
								{#if attribute.status === 'confirmed'}<span class="tag tag-success">Patvirtinta</span>
								{:else if attribute.status === 'rejected'}<span class="tag">Atmesta</span>{/if}
							</p>
							<div class="actions">
								<button
									type="button"
									class="button-secondary"
									aria-pressed={attribute.status === 'confirmed'}
									onclick={() => (attribute.status = 'confirmed')}
								>
									Patvirtinti<span class="visually-hidden"> „{text}“</span>
								</button>
								<button
									type="button"
									class="button-ghost"
									onclick={() => (attribute.draft = { name: attribute.name, value: attribute.value })}
								>
									Redaguoti<span class="visually-hidden"> „{text}“</span>
								</button>
								<button
									type="button"
									class="button-ghost"
									aria-pressed={attribute.status === 'rejected'}
									onclick={() => (attribute.status = 'rejected')}
								>
									Atmesti<span class="visually-hidden"> „{text}“</span>
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if reviewTried && undecided.length}
				<p class="field-error" role="alert">
					Patvirtink arba atmesk kiekvieną požymį – arba spausk „Patvirtinti visus“.
				</p>
			{/if}
			{#if form?.errors?.attributes}<p class="field-error">{form.errors.attributes}</p>{/if}
		</fieldset>
	{/if}
{/snippet}

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
		<p class="notice">Daiktų nerasta. Pakeisk paieškos žodį arba kategoriją.</p>
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
					<p class="attributes">
						{item.attributes.map(attributeText).join(' · ')}
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
	details {
		margin-bottom: var(--space-6);
	}
	details form {
		max-width: 36rem;
		margin-top: var(--space-4);
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
	details form.wide {
		max-width: 56rem;
	}
	.review {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}
	@media (min-width: 48rem) {
		.review {
			grid-template-columns: 16rem 1fr; /* photo beside the recognised fields */
		}
	}
	.review img {
		border-radius: var(--radius-m);
	}
	.review-attributes ul {
		display: grid;
		gap: var(--space-3);
		padding: 0;
		list-style: none;
	}
	.review-attributes li {
		margin: 0;
		padding: var(--space-3);
		border: 1px solid var(--c-line);
		border-radius: var(--radius-m);
	}
	.review-attributes li.undecided {
		border-color: var(--c-danger);
	}
	.review-attributes p {
		margin-bottom: var(--space-2);
	}
	.rejected {
		color: var(--c-text-muted);
		text-decoration: line-through;
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
			grid-template-columns: 2fr 1fr 1fr;
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
	h2 {
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
	.attributes {
		font-size: var(--text-s);
		color: var(--c-text-muted);
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
