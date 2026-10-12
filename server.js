import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { renderApp } from './dist/server/entry-server.js';

// A classic inline script runs after the server-rendered markup above it is parsed and
// before the client module hydrates. It does what Chrome's page translation does to a
// text node: replace it with two nested <font> elements holding the translated text.
const EDIT_DOM = `<script>
      (function () {
        var p = document.getElementById('greeting');
        var outer = document.createElement('font');
        var inner = document.createElement('font');
        outer.style.verticalAlign = inner.style.verticalAlign = 'inherit';
        inner.textContent = 'Hallo vom Server';
        outer.append(inner);
        p.firstChild.replaceWith(outer);
        console.log('Edited the DOM before hydration:', p.outerHTML);
      })();
    </script>`;

const port = Number(process.env.PORT ?? 3000);

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(await readFile(new URL('./dist/client/client.js', import.meta.url)));
    return;
  }
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }
  const control = url.searchParams.has('control');
  const { head, body } = await renderApp();
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="data:," />
    <title>${control ? 'Control' : 'Edited'} page</title>
    ${head}
  </head>
  <body>
    <div id="app">${body}</div>
    ${control ? '<!-- control: no DOM edit -->' : EDIT_DOM}
    <script type="module" src="/client.js"></script>
  </body>
</html>`);
}).listen(port, () => {
  console.log(`Edited page:  http://localhost:${port}/`);
  console.log(`Control page: http://localhost:${port}/?control`);
});
