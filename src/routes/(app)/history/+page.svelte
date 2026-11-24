<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Season } from '#lib/domain.ts';
	import type { HikeHistoryItem } from '#lib/server/history.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let pendingDelete = $state<HikeHistoryItem | null>(null);

	const SEASON_LABELS: Record<Season, string> = {
		WINTER: 'Žiema',
		SPRING: 'Pavasaris',
		SUMMER: 'Vasara',
		AUTUMN: 'Ruduo'
	};

	function openDeleteDialog(hike: HikeHistoryItem) {
		pendingDelete = hike;
		dialogEl?.showModal();
	}

	function closeDeleteDialog() {
		dialogEl?.close();
		pendingDelete = null;
	}
</script>

<svelte:head><title>Kelionių istorija – Alpinisto draugas</title></svelte:head>

<div class="head-row">
	<div>
		<h1>Kelionių istorija</h1>
		<p class="subtitle">Nuo naujausių iki seniausių. Pasirink kelionę, kad peržiūrėtum išsaugotas rekomendacijas.</p>
	</div>
	<a class="button" href={resolve('/(app)/plan')}>Pridėti kelionę</a>
</div>

{#if form?.deletedId}
	<p class="notice notice-success" role="status">Kelionės įrašas ištrintas iš istorijos.</p>
{/if}

{#if form?.deleteError}
	<p class="notice notice-danger" role="alert">{form.deleteError}</p>
{/if}

{#if data.hikes.length === 0}
	<section class="panel empty-state" aria-labelledby="empty-history-title">
		<h2 id="empty-history-title">Kelionių istorija dar tuščia</h2>
		<p>Kai suplanuosi kelionę ar sugeneruosi rekomendacijas, įrašai atsiras čia.</p>
		<a class="button" href={resolve('/(app)/plan')}>Pridėti kelionę</a>
	</section>
{:else}
	<ul class="history-list">
		{#each data.hikes as hike (hike.id)}
			<li class="panel history-card">
				<div class="card-top">
					<div>
						<h2>
							<a href={resolve('/(app)/recommendations/[id]', { id: hike.id })}>{hike.location}</a>
						</h2>
						<p class="dates">
							Datos: <strong>{hike.departureDate}</strong> – <strong>{hike.returnDate}</strong>
							<span class="sep">·</span>
							<span>{hike.days} d.</span>
							<span class="sep">·</span>
							<span>{SEASON_LABELS[hike.season]}</span>
						</p>
					</div>
					<div>
						{#if hike.hasPlan}
							<span class="tag tag-success">Rekomendacijos išsaugotos</span>
						{:else}
							<span class="tag">Rekomendacijų dar nėra</span>
						{/if}
					</div>
				</div>

				<div class="card-actions">
					<a class="button-secondary" href={resolve('/(app)/recommendations/[id]', { id: hike.id })}>
						Peržiūrėti įrašą
					</a>
					<button class="button-danger" type="button" onclick={() => openDeleteDialog(hike)}>
						Ištrinti
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<dialog bind:this={dialogEl} class="confirm-dialog" aria-labelledby="delete-dialog-title">
	<h2 id="delete-dialog-title">Patvirtinti kelionės ištrynimą</h2>
	{#if pendingDelete}
		<p>
			Ar tikrai nori negrįžtamai ištrinti kelionę <strong>{pendingDelete.location}</strong> (
			<strong>{pendingDelete.departureDate}</strong> – <strong>{pendingDelete.returnDate}</strong>)
			ir visas su ja susijusias išsaugotas rekomendacijas iš savo istorijos?
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				return async ({ update }) => {
					closeDeleteDialog();
					await update();
				};
			}}
		>
			<input type="hidden" name="hikeId" value={pendingDelete.id} />
			<div class="dialog-actions">
				<button class="button-secondary" type="button" onclick={closeDeleteDialog}>Atšaukti</button>
				<button class="button-danger" type="submit">Taip, ištrinti</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.head-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	.subtitle {
		margin: var(--space-1) 0 0;
		color: var(--c-text-muted);
	}
	.empty-state {
		text-align: center;
		padding-block: var(--space-6);
	}
	.history-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--space-4);
	}
	.history-card h2 {
		margin: 0;
		font-size: var(--text-l);
	}
	.history-card h2 a {
		text-decoration: none;
	}
	.history-card h2 a:hover {
		text-decoration: underline;
	}
	.card-top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.dates {
		margin: var(--space-2) 0 0;
		font-size: var(--text-s);
		color: var(--c-text-muted);
	}
	.sep {
		margin-inline: var(--space-1);
	}
	.card-actions {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--c-line);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.confirm-dialog {
		max-width: 28rem;
		padding: var(--space-5);
		border: 1px solid var(--c-line);
		border-radius: var(--radius);
		background: var(--c-surface);
		color: var(--c-text);
	}
	.confirm-dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
	}
	.dialog-actions {
		margin-top: var(--space-4);
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>