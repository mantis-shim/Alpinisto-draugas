<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Brand from '#lib/components/Brand.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const links = [
		{ route: '/(app)/plan', label: 'Kelionės planavimas' },
		{ route: '/(app)/account', label: 'Paskyra' }
	] as const;
</script>

<header class="container app-header">
	<Brand />
	<nav aria-label="Pagrindinis meniu">
		{#each links as link (link.route)}
			<a href={resolve(link.route)} aria-current={page.route.id === link.route ? 'page' : undefined}>
				{link.label}
			</a>
		{/each}
		<form method="POST" action={resolve('/logout')}>
			<button class="button-ghost" type="submit">Atsijungti</button>
		</form>
	</nav>
</header>

<main class="container app-main">
	{@render children()}
</main>

<style>
	.app-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3) var(--space-5);
		padding-block: var(--space-3);
		border-bottom: 1px solid var(--c-line);
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
	}
	nav button {
		padding-inline: var(--space-2); /* keeps the 44px height, evens the spacing with the links */
	}
	nav a {
		font-weight: 600;
		color: var(--c-text);
		text-decoration: none;
	}
	nav a:hover,
	nav a[aria-current='page'] {
		color: var(--c-primary);
		text-decoration: underline;
		text-decoration-thickness: 2px;
	}
	.app-main {
		padding-block: var(--space-7) var(--space-8);
	}
</style>
