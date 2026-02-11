// Service worker — handles screenshot capture requests from content script

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "capture-screenshot" && sender.tab) {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl || null });
    });
    return true; // keep channel open for async response
  }
});
