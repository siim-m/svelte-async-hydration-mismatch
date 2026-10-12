<script>
  import Greeting from './Greeting.svelte';
</script>

<header>
  <h1>Async hydration mismatch</h1>
  <nav><a href="/">Edited page</a> | <a href="/?control">Control page</a></nav>
</header>

<main>
  <svelte:boundary onerror={(error) => console.log('boundary onerror:', error)}>
    <Greeting />

    {#snippet failed(error)}
      <p id="failed">Boundary failed snippet: {JSON.stringify(error)}</p>
    {/snippet}
  </svelte:boundary>
</main>
