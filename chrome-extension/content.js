(() => {
  // Prevent double-injection
  if (window.__tagrelay_loaded) return;
  window.__tagrelay_loaded = true;

  let selectionMode = false;
  let taggedElements = []; // { el, badge, data }
  let hoveredEl = null;
  let serverPort = 7890;
  let screenshotEnabled = false;
  let eventSource = null;

  // Load settings
  chrome.storage.sync.get({ port: 7890, screenshot: false }, (s) => {
    serverPort = s.port;
    screenshotEnabled = s.screenshot;
    connectSSE();
  });

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.port) {
      serverPort = changes.port.newValue;
      connectSSE();
    }
    if (changes.screenshot) {
      screenshotEnabled = changes.screenshot.newValue;
    }
  });

  // --- SSE Connection ---
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`http://localhost:${serverPort}/events`);
    eventSource.addEventListener("clear", () => {
      clearAllTags();
      if (selectionMode) toggleSelectionMode();
    });
    eventSource.onerror = () => {
      // Silently retry — EventSource auto-reconnects
    };
  }

  // --- Floating Action Button ---
  const fab = document.createElement("button");
  fab.id = "tagrelay-fab";
  fab.textContent = "TR";
  fab.title = "TagRelay — Click to start tagging elements";
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleSelectionMode();
  });
  document.documentElement.appendChild(fab);

  // --- Toolbar ---
  const toolbar = document.createElement("div");
  toolbar.id = "tagrelay-toolbar";
  toolbar.style.display = "none";

  const btnClear = document.createElement("button");
  btnClear.id = "tagrelay-btn-clear";
  btnClear.textContent = "Clear All";
  btnClear.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    clearAllTags();
    syncTags();
  });

  toolbar.appendChild(btnClear);
  document.documentElement.appendChild(toolbar);

  // --- Selection Mode ---
  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    fab.classList.toggle("active", selectionMode);
    toolbar.style.display = selectionMode ? "flex" : "none";
    if (!selectionMode && hoveredEl) {
      hoveredEl.classList.remove("tagrelay-highlight");
      hoveredEl = null;
    }
  }

  // --- Unique CSS Selector Generator ---
  function getSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let current = el;
    while (current && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${CSS.escape(current.id)} > ${part}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  // --- Tagging ---
  function isTagRelayUI(el) {
    return (
      el === fab ||
      el === toolbar ||
      toolbar.contains(el) ||
      el.classList.contains("tagrelay-badge")
    );
  }

  function findTagged(el) {
    return taggedElements.findIndex((t) => t.el === el);
  }

  function positionBadge(badge, el) {
    const rect = el.getBoundingClientRect();
    badge.style.top = `${window.scrollY + rect.top - 10}px`;
    badge.style.left = `${window.scrollX + rect.right - 10}px`;
  }

  function addTag(el) {
    const index = taggedElements.length + 1;
    const rect = el.getBoundingClientRect();

    const badge = document.createElement("span");
    badge.className = "tagrelay-badge";
    badge.textContent = String(index);
    positionBadge(badge, el);
    document.documentElement.appendChild(badge);

    el.classList.add("tagrelay-tagged");

    const data = {
      index,
      selector: getSelector(el),
      innerText: (el.innerText || "").trim().slice(0, 500),
      outerHTML: el.outerHTML.slice(0, 2000),
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      pageURL: location.href,
      timestamp: new Date().toISOString(),
    };

    taggedElements.push({ el, badge, data });

    if (screenshotEnabled) {
      captureElementScreenshot(el, taggedElements.length - 1);
    }
  }

  function removeTag(idx) {
    const entry = taggedElements[idx];
    entry.badge.remove();
    entry.el.classList.remove("tagrelay-tagged");
    taggedElements.splice(idx, 1);
    renumberBadges();
  }

  function renumberBadges() {
    taggedElements.forEach((t, i) => {
      t.data.index = i + 1;
      t.badge.textContent = String(i + 1);
      positionBadge(t.badge, t.el);
    });
  }

  function clearAllTags() {
    for (const t of taggedElements) {
      t.badge.remove();
      t.el.classList.remove("tagrelay-tagged");
    }
    taggedElements = [];
    updateFabCount();
  }

  function updateFabCount() {
    fab.textContent = taggedElements.length > 0 ? String(taggedElements.length) : "TR";
  }

  // --- Screenshot ---
  function captureElementScreenshot(el, idx) {
    const rect = el.getBoundingClientRect();
    chrome.runtime.sendMessage({ type: "capture-screenshot" }, (response) => {
      if (!response || !response.dataUrl) return;
      // Crop to element bounding box
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(
          img,
          rect.x * dpr, rect.y * dpr,
          rect.width * dpr, rect.height * dpr,
          0, 0,
          rect.width * dpr, rect.height * dpr
        );
        if (taggedElements[idx]) {
          taggedElements[idx].data.screenshot = canvas.toDataURL("image/png");
          syncTags();
        }
      };
      img.src = response.dataUrl;
    });
  }

  // --- Sync to server ---
  function syncTags() {
    const elements = taggedElements.map((t) => t.data);
    updateFabCount();
    fetch(`http://localhost:${serverPort}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageURL: location.href, elements }),
    }).catch(() => {
      // Server not running — silently ignore
    });
  }

  // --- Event Handlers ---
  document.addEventListener(
    "mouseover",
    (e) => {
      if (!selectionMode) return;
      if (isTagRelayUI(e.target)) return;
      if (hoveredEl) hoveredEl.classList.remove("tagrelay-highlight");
      hoveredEl = e.target;
      hoveredEl.classList.add("tagrelay-highlight");
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!selectionMode) return;
      if (e.target === hoveredEl) {
        hoveredEl.classList.remove("tagrelay-highlight");
        hoveredEl = null;
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!selectionMode) return;
      if (isTagRelayUI(e.target)) return;
      e.preventDefault();
      e.stopPropagation();

      const idx = findTagged(e.target);
      if (idx !== -1) {
        removeTag(idx);
      } else {
        addTag(e.target);
      }
      syncTags();
    },
    true
  );

  // Reposition badges on scroll/resize
  function repositionBadges() {
    taggedElements.forEach((t) => positionBadge(t.badge, t.el));
  }
  window.addEventListener("scroll", repositionBadges, { passive: true });
  window.addEventListener("resize", repositionBadges, { passive: true });
})();
