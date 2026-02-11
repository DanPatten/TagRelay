const portInput = document.getElementById("port");
const screenshotInput = document.getElementById("screenshot");
const statusEl = document.getElementById("status");

// Load saved settings
chrome.storage.sync.get({ port: 7890, screenshot: false }, (s) => {
  portInput.value = s.port;
  screenshotInput.checked = s.screenshot;
  checkConnection(s.port);
});

// Save on change
portInput.addEventListener("change", () => {
  const port = parseInt(portInput.value, 10);
  if (port >= 1024 && port <= 65535) {
    chrome.storage.sync.set({ port });
    checkConnection(port);
  }
});

screenshotInput.addEventListener("change", () => {
  chrome.storage.sync.set({ screenshot: screenshotInput.checked });
});

function checkConnection(port) {
  statusEl.textContent = "Checking connection...";
  fetch(`http://localhost:${port}/tags`)
    .then((r) => {
      if (r.ok) {
        return r.json().then((data) => {
          const count = data.tags ? data.tags.length : 0;
          statusEl.textContent = `Connected — ${count} tag(s)`;
          statusEl.style.color = "#2a2";
        });
      }
      throw new Error("Bad response");
    })
    .catch(() => {
      statusEl.textContent = "Server not reachable";
      statusEl.style.color = "#c33";
    });
}
