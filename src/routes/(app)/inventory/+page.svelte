<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import {
		CATEGORY_LABELS,
		ITEM_CATEGORIES,
		RECOGNITION_CHECK_BELOW,
		TEMPERATURE_LABELS,
		type InventoryItem
	} from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let deleteDialog: HTMLDialogElement;
	let toDelete: InventoryItem | undefined = $state();

	const emptyValues = { name: '', category: '', suitability: [], attributes: '' };
	// open while the inventory is empty or the last submit needs fixing
	const addOpen = $derived(data.items.length === 0 || !!(form?.values || form?.photoError || form?.notRecognized));
	let recognizing = $state(false); // the model can take up to 30 s

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

<details open={addOpen}>
	<summary>Pridėti daiktą</summary>
	<!-- UC-3: one photo; the server checks type and size and converts it -->
	<form
		method="POST"
		action="?/recognize"
		enctype="multipart/form-data"
		novalidate
		use:enhance={() => {
			recognizing = true;
			return async ({ update }) => {
				await update();
				recognizing = false;
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
				id="item-photo"
				name="photo"
				type="file"
				accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
				aria-invalid={form?.photoError ? 'true' : undefined}
				aria-describedby={form?.photoError ? 'item-photo-hint item-photo-error' : 'item-photo-hint'}
			/>
			<p class="field-hint" id="item-photo-hint">JPG, PNG arba HEIC iki 10 MB. Vienoje nuotraukoje – vienas daiktas.</p>
			{#if form?.photoError}<p class="field-error" id="item-photo-error">{form.photoError}</p>{/if}
		</div>
		<button class="button-secondary" disabled={recognizing}>
			{#if recognizing}<span class="spinner" aria-hidden="true"></span> Atpažįstama…{:else}Atpažinti{/if}
		</button>
	</form>

	<!-- novalidate: the server checks everything and answers in Lithuanian -->
	<form id="add-item" method="POST" action="?/create" novalidate use:enhance>
		{#if form?.confidence !== undefined}
			<p class="notice" role="status">
				Daiktą atpažino dirbtinis intelektas (tikrumas {form.confidence} %). Patikrink laukus ir išsaugok.
				{#if form.confidence < RECOGNITION_CHECK_BELOW}<span class="tag tag-warning">Patikrinkite</span>{/if}
			</p>
		{/if}
		{#if form?.duplicate}
			<p class="notice notice-warning" role="alert">
				Daiktas „{form.values.name}“ inventoriuje jau yra. Vis tiek pridėti dar vieną?
			</p>
		{/if}
		<ItemFields values={form?.values ?? emptyValues} errors={form?.errors ?? {}} />
		<div class="actions">
			{#if form?.duplicate}
				<button name="duplicateOk" value="1">Išsaugoti vis tiek</button>
				<a class="button button-secondary" href={resolve('/(app)/inventory')}>Atšaukti</a>
			{:else}
				<button>Išsaugoti</button>
			{/if}
		</div>
	</form>
</details>

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
						{item.attributes.map((a) => (a.value ? `${a.name}: ${a.value}` : a.name)).join(' · ')}
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
