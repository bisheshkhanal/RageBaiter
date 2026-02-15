export {};

console.log('[RageBaiter] Content script loaded');

if (document.documentElement) {
  document.documentElement.dataset.ragebaiterLoaded = 'true';
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        const tweets = node.matches?.('article[data-testid="tweet"]')
          ? [node]
          : node.querySelectorAll?.('article[data-testid="tweet"]') ?? [];
        
        for (const tweet of tweets) {
          if (!(tweet instanceof HTMLElement)) continue;
          if (tweet.dataset.ragebaiterProcessed) continue;
          
          tweet.dataset.ragebaiterProcessed = 'true';
          
          console.log('[RageBaiter] Tweet detected:', tweet.getAttribute('data-testid'));
          
          tweet.dataset.ragebaiterLevel = 'none';
        }
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

const existingTweets = document.querySelectorAll('article[data-testid="tweet"]');
for (const tweet of existingTweets) {
  if (!(tweet instanceof HTMLElement)) continue;
  if (tweet.dataset.ragebaiterProcessed) continue;
  
  tweet.dataset.ragebaiterProcessed = 'true';
  tweet.dataset.ragebaiterLevel = 'none';
}
