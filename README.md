# Hydration mismatch after an `await` is not recovered

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/siim-m/svelte-async-hydration-mismatch)

Svelte 5 with `compilerOptions.experimental.async`. When the server-rendered DOM of a subtree that hydrates after an `await` doesn't match, Svelte doesn't recover by remounting. Since 5.57.2 it also doesn't pass the error to the surrounding `<svelte:boundary>`. It removes the subtree's server-rendered DOM and leaves an unhandled promise rejection with `{}`.

This is plain Svelte without SvelteKit. The server calls `render` from `svelte/server`, the client calls `hydrate` from `svelte`, and `@sveltejs/vite-plugin-svelte` builds both.

## The app

- `src/App.svelte` has a `<header>`, which hydrates in the synchronous pass, and a `<svelte:boundary>` with `onerror` (it logs the error) and a `failed` snippet.
- `src/Greeting.svelte`, inside the boundary, does `const text = $derived(await Promise.resolve('Hello from the server'))` and renders `{#if text}<Message {text} />{/if}`.
- `src/Message.svelte` renders `<p id="greeting">{text}</p>`.
- `server.js` serves `await render(App)`. On `/` it adds a classic inline script after the markup. The script runs before hydration and does what Chrome's page translation does to a text node. It replaces the text in the `<p>` with `<font><font>Hallo vom Server</font></font>`. The control page, `/?control`, leaves the DOM alone.

## Steps

```sh
npm install
npm start
```

Open http://localhost:3000/ and look at the page and the browser console. Then open http://localhost:3000/?control.

`package.json` pins svelte 5.57.2. To compare with 5.56.8, run `npm run repro:5.56.8`. It installs svelte@5.56.8 without saving, builds and serves. `npm run repro:5.57.2` switches back.

`npm run verify` loads both pages in headless Chrome and prints the DOM, the console and whether the server-rendered `<p>` survived. It needs Google Chrome, or `npx playwright-core install chromium` and `PW_CHANNEL=chromium`.

## Expected

Svelte recovers from the mismatch the way it does for one in the synchronous pass. It renders the `<p>` again on the client and logs `hydration_mismatch`. If it can't, the boundary gets the error, as on 5.56.8. Either way there is no unhandled rejection and no content silently removed.

## Actual

### 5.57.2

The area below the header is blank. `onerror` isn't called and the `failed` snippet isn't shown. The server-rendered `<p>` is gone.

```
Edited the DOM before hydration: <p id="greeting"><font style="vertical-align: inherit;"><font style="vertical-align: inherit;">Hallo vom Server</font></font></p>
hydrate() returned
https://svelte.dev/e/hydration_mismatch
Uncaught (in promise) {}
```

`<main>` after load:

```html
<main><!--[--><!--]--><!--]--><!--]--></main>
```

### 5.56.8

The boundary catches Svelte's mismatch sentinel, a bare `{}`. `onerror` runs and the `failed` snippet replaces the content.

```
Edited the DOM before hydration: <p id="greeting"><font style="vertical-align: inherit;"><font style="vertical-align: inherit;">Hallo vom Server</font></font></p>
hydrate() returned
https://svelte.dev/e/hydration_mismatch
boundary onerror: {}
```

`<main>` after load:

```html
<main><!--[--><!--]--><!--]--><p id="failed">Boundary failed snippet: {}</p><!--]--></main>
```

### Control page

On both versions the control page hydrates cleanly. The server-rendered `<p>` stays, and the console shows only `hydrate() returned`.

## Why

Paths are in `node_modules/svelte/src/internal/client/`, with line numbers from 5.57.2.

1. `hydrate()` (`render.js` 95-150) runs one synchronous pass inside a try/catch. On a mismatch, the catch clears the target and mounts again (124-146). That catch is the only place Svelte recovers from a mismatch. The `recover` option only applies there too.
2. The `{#if}` in `Greeting.svelte` depends on an awaited value, so the compiler wraps it in `$.async(...)`. The synchronous pass skips its server-rendered nodes. `flatten`'s `finish` (`reactivity/async.js` 72-86) hydrates them later in a promise callback (`.then(() => finish([]))`, line 92), after `hydrate()` has returned.
3. In `Message.svelte`, `only_child` expects a text node in the `<p>` and finds the `<font>` (`dom/operations.js` 177-186). `reset` then throws `HYDRATION_ERROR` (`dom/hydration.js` 48-58), which is a bare `{}` (`src/constants.js` 29).
4. `create_effect`'s catch (`reactivity/effects.js` 138-143) destroys the `{#if}` branch it was creating. The inner `$.async` around `<Message>` had already set the branch's start and end nodes (`dom/blocks/async.js` 27). So `destroy_effect` (518-528) calls `remove_effect_dom` (577-585), which removes the server-rendered `<p>`.
5. `finish` passes the error to `invoke_error_boundary`. Since sveltejs/svelte#18841 that function rethrows `HYDRATION_ERROR` before it looks for a boundary (`error-handling.js` 54-57). `Boundary.error` does the same (`dom/blocks/boundary.js` 470-473). Nothing catches it, so the promise from line 92 rejects unhandled with `{}`.

On 5.56.8, `invoke_error_boundary` gives the sentinel to the boundary instead, so `onerror` and `failed` run.

Two variations behave differently on 5.57.2. With `<Message {text} />` and no `{#if}`, the edited `<p>` stays on the page but never hydrates. The rejection and the missing `onerror` are the same. With `<p>{text}</p>` directly in the component that awaits, Svelte claims the `<p>` in the synchronous pass, so `hydrate()` catches the mismatch and remounts the whole app.

## Where this happens

Chrome's built-in page translation works in chunks and often translates `<main>` before the header. It rewrites text nodes into `<font>` elements before hydration starts. The synchronous pass then matches and the awaited subtree doesn't. Browser extensions and iOS data detectors, which turn phone numbers into links, can do the same.

## Links

- sveltejs/svelte#18840, "Hydration mismatch recovery is intercepted by svelte:boundary"
- sveltejs/svelte#18841, "fix: bypass error boundaries for hydration recovery", first released in 5.57.2
