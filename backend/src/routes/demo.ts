import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mattWalshPfpPath = resolve(__dirname, "mattwalsh.png");

const demoHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RageBaiter Demo Feed</title>
    <style>
      :root {
        --bg-color: #000000;
        --border-color: #2f3336;
        --text-primary: #e7e9ea;
        --text-secondary: #71767b;
        --accent-color: #1d9bf0;
        --hover-bg: rgba(255, 255, 255, 0.03);
      }
      body {
        background-color: var(--bg-color);
        color: var(--text-primary);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
        padding: 0;
        overflow-y: scroll;
      }
      main {
        max-width: 600px;
        margin: 0 auto;
        border-left: 1px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        min-height: 100vh;
      }
      h1 {
        position: sticky;
        top: 0;
        background-color: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(12px);
        margin: 0;
        padding: 16px;
        font-size: 20px;
        font-weight: 700;
        border-bottom: 1px solid var(--border-color);
        z-index: 10;
        cursor: pointer;
      }
      article {
        display: block;
        border-bottom: 1px solid var(--border-color);
        padding: 12px 16px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      article:hover {
        background-color: var(--hover-bg);
      }
      .tweet-container {
        display: flex;
        flex-direction: row;
      }
      .avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-right: 12px;
        flex-shrink: 0;
        background-color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 18px;
        overflow: hidden;
      }
      .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .tweet-content {
        flex: 1;
        min-width: 0;
      }
      header {
        display: flex;
        align-items: baseline;
        justify-content: flex-start;
        font-size: 15px;
        line-height: 20px;
        gap: 4px;
        white-space: nowrap;
        margin-bottom: 2px;
      }
      .display-name {
        font-weight: 700;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .handle {
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      header a {
        text-decoration: none;
        color: var(--text-secondary);
        display: flex;
        gap: 4px;
      }
      header a:hover {
        text-decoration: underline;
      }
      header a::before {
        content: "·";
        padding-right: 4px;
      }
      time {
        color: inherit;
      }
      div[data-testid="tweetText"] {
        font-size: 15px;
        line-height: 20px;
        color: var(--text-primary);
        word-wrap: break-word;
        white-space: pre-wrap;
      }
      .actions {
        display: flex;
        justify-content: space-between;
        margin-top: 12px;
        max-width: 425px;
        color: var(--text-secondary);
        font-size: 13px;
      }
      .action-item {
        cursor: pointer;
        transition: color 0.2s;
      }
      .action-item:hover {
        color: var(--accent-color);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Home</h1>

      <article data-testid="tweet" role="article">
        <div class="tweet-container">
          <div class="avatar"><img src="/demo/mattwalsh.png" alt="Matt Walsh" /></div>
          <div class="tweet-content">
            <header>
              <span class="display-name">Matt Walsh</span>
              <span class="handle">@MattWalshBlog</span>
              <a href="/MattWalshBlog/status/1907859938220847606">
                <time datetime="2025-04-04T12:00:00.000Z">Apr 4, 2025</time>
              </a>
            </header>
            <div data-testid="tweetText" lang="en">If I told you that a young man stabbed another young man to death for telling him that he was in the wrong seat, and then I told you that one young man in this altercation was white and the other black, and then I asked you to guess the race of the assailant, every single person would know the answer immediately. Young black males are violent to a wildly, outrageously disproportionate degree. That's just a fact. We all know it. And it's time that we speak honestly about it, or nothing will ever change.</div>
            <div class="actions">
              <span class="action-item">&#x1f4ac; 8.2K</span>
              <span class="action-item">&#x21c4; 12K</span>
              <span class="action-item">&#x2661; 47K</span>
              <span class="action-item">Share</span>
            </div>
          </div>
        </div>
      </article>
    </main>
  </body>
</html>`;

export const demoRoutes = new Hono();

demoRoutes.get("/mattwalsh.png", (c) => {
  const imageBuffer = readFileSync(mattWalshPfpPath);
  return c.body(imageBuffer, 200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600",
  });
});

demoRoutes.get("/", (c) => {
  return c.html(demoHtml, 200);
});
