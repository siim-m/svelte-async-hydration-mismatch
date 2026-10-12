<script>
  import Message from './Message.svelte';

  const text = $derived(await Promise.resolve('Hello from the server'));
</script>

{#if text}
  <Message {text} />
{/if}
