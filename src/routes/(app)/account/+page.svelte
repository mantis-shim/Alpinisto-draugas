<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let confirmDialog: HTMLDialogElement;
</script>

<svelte:head><title>Paskyra – Alpinisto draugas</title></svelte:head>

<h1>Paskyra</h1>

<dl>
	<dt>El. paštas</dt>
	<dd>{data.user.email}</dd>
</dl>

<section aria-labelledby="delete-title">
	<h2 id="delete-title">Paskyros ištrynimas</h2>
	<p>
		Kartu su paskyra visam laikui ištrinsime tavo inventorių, fizinio pasirengimo klausimyno
		atsakymus ir kelionių istoriją.
	</p>
	<button class="button-danger" type="button" onclick={() => confirmDialog.showModal()}>
		Ištrinti paskyrą
	</button>
</section>

<dialog bind:this={confirmDialog} aria-labelledby="confirm-title">
	<h2 id="confirm-title">Ištrinti paskyrą?</h2>
	<p>
		Bus ištrinta paskyra <strong>{data.user.email}</strong>, visas inventorius, klausimyno
		atsakymai ir kelionių istorija. Šio veiksmo atšaukti negalima.
	</p>
	<div class="dialog-actions">
		<form method="dialog">
			<button class="button-secondary">Atšaukti</button>
		</form>
		<form method="POST" action="?/delete">
			<button class="button-danger">Ištrinti paskyrą</button>
		</form>
	</div>
</dialog>

<style>
	section {
		margin-top: var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--c-line);
	}
	h2 {
		font-size: var(--text-2xl);
	}
	.dialog-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-3);
	}
</style>
