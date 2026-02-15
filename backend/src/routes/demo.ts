import { Hono } from "hono";

const demoHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RageBaiter Demo Feed</title>
  </head>
  <body>
    <main>
      <h1>Demo Feed</h1>

      <article data-testid="tweet" role="article">
        <header>
          <a href="/policywatch/status/1845081200000000001">
            <time datetime="2026-02-15T09:00:00.000Z">9:00 AM - Feb 15, 2026</time>
          </a>
        </header>
        <div data-testid="tweetText" lang="en">
          PolicyWatch: The government's liberal policies are destroying the economy. We need conservative leadership to fix this political crisis.
        </div>
      </article>

      <article data-testid="tweet" role="article">
        <header>
          <a href="/civiclens/status/1845082200000000002">
            <time datetime="2026-02-15T09:05:00.000Z">9:05 AM - Feb 15, 2026</time>
          </a>
        </header>
        <div data-testid="tweetText" lang="en">
          CivicLens: The radical left's socialist agenda is destroying our nation. We need to vote them out and restore traditional values to save our country.
        </div>
      </article>

      <article data-testid="tweet" role="article">
        <header>
          <a href="/datascout/status/1845083200000000003">
            <time datetime="2026-02-15T09:10:00.000Z">9:10 AM - Feb 15, 2026</time>
          </a>
        </header>
        <div data-testid="tweetText" lang="en">
          DataScout: The establishment politicians are corrupt and the mainstream media is lying to us. We need a political revolution to change this system.
        </div>
      </article>
    </main>
  </body>
</html>`;

export const demoRoutes = new Hono();

demoRoutes.get("/", (c) => {
  return c.html(demoHtml, 200);
});
