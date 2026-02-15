console.log("RageBaiter SW ready");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[RageBaiter] Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[RageBaiter] Message received:", message);

  if (message.type === "TWEET_DETECTED") {
    console.log("[RageBaiter] Tweet detected:", message.data);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

export {};
