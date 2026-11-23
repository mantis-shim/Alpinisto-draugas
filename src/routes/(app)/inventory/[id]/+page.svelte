<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import { itemFormValues } from '#lib/validation.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Daikto redagavimas – Alpinisto draugas</title></svelte:head>

<h1>Daikto redagavimas</h1>

<!-- novalidate: the server checks everything and answers in Lithuanian -->
<form method="POST" novalidate use:enhance>
	<ItemFields values={form?.values ?? itemFormValues(data.item)} errors={form?.errors ?? {}} />
	<div class="actions">
		<button>Išsaugoti</button>
		<a class="button button-secondary" href={resolve('/(app)/inventory')}>Atšaukti</a>
	</div>
</form>

<style>
	form {
		max-width: 36rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
</style>
