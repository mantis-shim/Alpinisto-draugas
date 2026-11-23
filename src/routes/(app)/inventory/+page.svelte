<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import { CATEGORY_LABELS, TEMPERATURE_LABELS, type InventoryItem } from '#lib/domain.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let deleteDialog: HTMLDialogElement;
	let toDelete: InventoryItem | undefined = $state();

	const emptyValues = { name: '', category: '', suitability: [], attributes: '' };
	// open while the inventory is empty or the last submit needs fixing
	const addOpen = $derived(data.items.length === 0 || !!form?.values);
</script>

<svelte:head><title>Inventorius – Alpinisto draugas</title></svelte:head>

<h1>Inventorius</h1>
<p>Surašyk turimą ekipuotę. Rekomendacijose pasakysime, ką pasiimti iš inventoriaus ir ko trūksta.</p>

{#if form?.created}
	<p class="notice notice-success" role="status">Daiktas „{form.created}“ pridėtas į inventorių.</p>
{/if}
{#if form?.missing}
	<p class="notice notice-danger" role="alert">Šio daikto inventoriuje nebėra.</p>
{/if}

<details open={addOpen}>
	<summary>Pridėti daiktą</summary>
	<!-- novalidate: the server checks everything and answers in Lithuanian -->
	<form method="POST" action="?/create" novalidate use:enhance>
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

{#if data.items.length === 0}
	<p class="notice" role="status">Inventoriuje dar nėra daiktų. Pridėk pirmąjį daiktą formoje aukščiau.</p>
{:else}
	<ul class="items">
		{#each data.items as item (item.id)}
			<li class="panel">
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
						Redaguoti
					</a>
					<button
						class="button-ghost"
						type="button"
						onclick={() => {
							toDelete = item;
							deleteDialog.showModal();
						}}
					>
						Ištrinti
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
		margin-top: var(--space-4);
	}
	.items {
		display: grid;
		gap: var(--space-3);
		padding: 0;
		list-style: none;
	}
	.items li {
		margin: 0;
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
