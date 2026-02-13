(() => {
  // Prevent double-injection
  if (window.__ghostrelay_loaded) return;
  window.__ghostrelay_loaded = true;

  let currentMode = null; // null | 'tag' | 'snip'
  let selectionMode = false; // tag mode active (kept for backward compat with event handlers)
  let radialMenuOpen = false;
  let lastMode = "tag";
  let taggedElements = []; // { el, badge, popover, popoverMode, data }
  let snippedElements = []; // { badge, popover, popoverMode, data }
  let hoveredEl = null;
  let serverPort = 7391;
  let screenshotEnabled = false;
  let enabled = false;
  let eventSource = null;
  let nextIndex = 1;
  const currentHostname = location.hostname;

  // Load settings
  chrome.storage.sync.get({ port: 7391, screenshot: false, enabledDomains: {} }, (s) => {
    serverPort = s.port;
    screenshotEnabled = s.screenshot;
    enabled = !!(s.enabledDomains || {})[currentHostname];
    applyEnabledState();
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
    if (changes.enabledDomains) {
      enabled = !!(changes.enabledDomains.newValue || {})[currentHostname];
      applyEnabledState();
    }
  });

  function applyEnabledState() {
    fab.classList.toggle("ghostrelay-disabled", !enabled);
    if (!enabled && currentMode) {
      exitMode();
    }
  }

  // --- SSE Connection ---
  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`http://localhost:${serverPort}/events`);
    eventSource.addEventListener("clear", () => {
      clearAllTags();
      clearAllSnips();
      if (currentMode) exitMode();
    });
    eventSource.onerror = () => {
      // Silently retry — EventSource auto-reconnects
    };
  }

  // --- Floating Action Button ---
  const fab = document.createElement("button");
  fab.id = "ghostrelay-fab";
  fab.classList.add("ghostrelay-disabled"); // Start hidden until storage loads
  const iconUrl = chrome.runtime.getURL("icons/fab_icon.png");
  fab.style.backgroundImage = `url("${iconUrl}")`;
  fab.style.backgroundSize = "contain";
  fab.style.backgroundPosition = "center";
  fab.style.backgroundRepeat = "no-repeat";
  fab.title = "GhostRelay — Click to toggle";
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (radialMenuOpen) {
      if (currentMode) exitMode();
      radialMenu.style.display = "none";
      radialMenuOpen = false;
    } else {
      radialMenu.style.display = "flex";
      radialMenuOpen = true;
      enterMode(lastMode);
    }
  });
  document.documentElement.appendChild(fab);

  // --- Radial Menu ---
  const radialMenu = document.createElement("div");
  radialMenu.className = "ghostrelay-radial-menu";
  radialMenu.style.display = "none";

  const tagSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
  const scissorsSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';

  const tagBtn = document.createElement("button");
  tagBtn.className = "ghostrelay-radial-btn";
  tagBtn.innerHTML = tagSvg;
  tagBtn.title = "Tag elements";
  tagBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentMode === "tag") {
      exitMode();
    } else {
      if (currentMode) exitMode();
      enterMode("tag");
    }
  });

  const snipBtn = document.createElement("button");
  snipBtn.className = "ghostrelay-radial-btn";
  snipBtn.innerHTML = scissorsSvg;
  snipBtn.title = "Snip screen region";
  snipBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (currentMode === "snip") {
      exitMode();
    } else {
      if (currentMode) exitMode();
      enterMode("snip");
    }
  });

  radialMenu.appendChild(tagBtn);
  radialMenu.appendChild(snipBtn);
  document.documentElement.appendChild(radialMenu);

  // --- Mode Management ---
  function updateRadialHighlight() {
    tagBtn.classList.remove("active-tag");
    snipBtn.classList.remove("active-snip");
    if (currentMode === "tag") {
      tagBtn.classList.add("active-tag");
    } else if (currentMode === "snip") {
      snipBtn.classList.add("active-snip");
    }
  }

  function enterMode(mode) {
    currentMode = mode;
    lastMode = mode;
    suppressNextClick = false;
    if (mode === "tag") {
      selectionMode = true;
      fab.classList.add("active");
      fab.classList.remove("active-snip");
    } else if (mode === "snip") {
      selectionMode = false;
      fab.classList.add("active-snip");
      fab.classList.remove("active");
      startSnipOverlay();
    }
    updateRadialHighlight();
    updateClearButton();
  }

  function exitMode() {
    if (currentMode === "tag") {
      selectionMode = false;
      fab.classList.remove("active");
      if (hoveredEl) {
        hoveredEl.classList.remove("ghostrelay-highlight");
        hoveredEl = null;
      }
    } else if (currentMode === "snip") {
      fab.classList.remove("active-snip");
      removeSnipOverlay();
    }
    currentMode = null;
    updateRadialHighlight();
    updateClearButton();
  }

  // --- Clear Button (trash icon) ---
  const btnClear = document.createElement("button");
  btnClear.id = "ghostrelay-btn-clear";
  btnClear.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.5 14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  btnClear.title = "Clear all tags and snips";
  btnClear.style.display = "none";
  btnClear.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    clearAllTags();
    clearAllSnips();
    syncTags();
  });
  document.documentElement.appendChild(btnClear);

  function updateClearButton() {
    const hasItems = taggedElements.length > 0 || snippedElements.length > 0;
    btnClear.style.display = hasItems ? "flex" : "none";
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

  // --- Richer Tag Data Helpers ---
  function getAttributes(el) {
    const keys = ["id", "class", "role", "aria-label", "href", "src", "name", "placeholder", "type", "alt", "title", "data-testid"];
    const attrs = {};
    for (const key of keys) {
      const val = el.getAttribute(key);
      if (val != null && val !== "") attrs[key] = val;
    }
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  }

  function getParentContext(el) {
    const ancestors = [];
    let current = el.parentElement;
    let depth = 0;
    while (current && current !== document.documentElement && depth < 3) {
      let desc = current.tagName.toLowerCase();
      if (current.classList.length > 0) desc += "." + Array.from(current.classList).join(".");
      ancestors.push(desc);
      current = current.parentElement;
      depth++;
    }
    return ancestors.length > 0 ? ancestors : undefined;
  }

  // --- UI Detection ---
  function isGhostRelayUI(el) {
    if (!el || !el.closest) return false;
    return (
      el === fab ||
      el.closest("#ghostrelay-fab") ||
      el.closest("#ghostrelay-btn-clear") ||
      el.closest(".ghostrelay-badge") ||
      el.closest(".ghostrelay-badge-snip") ||
      el.closest(".ghostrelay-popover") ||
      el.closest(".ghostrelay-radial-menu") ||
      el.closest(".ghostrelay-inline-toolbar") ||
      el.closest(".ghostrelay-inline-canvas") ||
      el.closest(".ghostrelay-snip-region")
    );
  }

  function findTagged(el) {
    return taggedElements.findIndex((t) => t.el === el);
  }

  function positionBadge(badge, el) {
    const rect = el.getBoundingClientRect();
    const margin = 4;

    // Hide badge if element is entirely off-screen
    const offScreen =
      rect.right < 0 ||
      rect.left > window.innerWidth ||
      rect.bottom < 0 ||
      rect.top > window.innerHeight;
    badge.style.display = offScreen ? "none" : "";
    if (offScreen) return;

    // Position at element's top-right corner, clamped to viewport
    let top = rect.top - 10;
    let left = rect.right - 10;
    top = Math.max(margin, Math.min(top, window.innerHeight - 24 - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - 30 - margin));
    badge.style.top = `${top}px`;
    badge.style.left = `${left}px`;
  }

  function positionPopover(popover, badge) {
    const badgeRect = badge.getBoundingClientRect();
    const margin = 8;

    const popW = popover.offsetWidth || 280;
    const popH = popover.offsetHeight || 160;

    let top = badgeRect.bottom + 6;
    let left = badgeRect.left;

    if (left + popW > window.innerWidth - margin) {
      left = window.innerWidth - popW - margin;
    }
    if (left < margin) {
      left = margin;
    }
    if (top + popH > window.innerHeight - margin) {
      top = badgeRect.top - popH - 6;
    }
    if (top < margin) {
      top = margin;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  // --- Popover (shared by tags and snips) ---
  function createPopover(entry, type) {
    const popover = document.createElement("div");
    popover.className = "ghostrelay-popover";
    popover.style.display = "none";

    // Header bar
    const header = document.createElement("div");
    header.className = "ghostrelay-popover-header";
    if (type === "snip") {
      header.classList.add("ghostrelay-popover-header-snip");
    }
    const headerIcon = document.createElement("svg");
    headerIcon.className = "ghostrelay-popover-header-icon";
    headerIcon.setAttribute("viewBox", "0 0 24 24");
    headerIcon.setAttribute("fill", "none");
    headerIcon.setAttribute("stroke", "currentColor");
    headerIcon.setAttribute("stroke-width", "2");
    headerIcon.setAttribute("stroke-linecap", "round");
    headerIcon.setAttribute("stroke-linejoin", "round");

    if (type === "snip") {
      headerIcon.innerHTML = '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>';
      header.appendChild(headerIcon);
      header.appendChild(document.createTextNode(`Snip #${entry.data.index}`));
    } else {
      headerIcon.innerHTML = '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>';
      header.appendChild(headerIcon);
      header.appendChild(document.createTextNode(`Tag #${entry.data.index}`));
    }

    // Preview label (shown on hover)
    const preview = document.createElement("div");
    preview.className = "ghostrelay-popover-preview";

    // Snip screenshot preview
    if (type === "snip" && entry.data.screenshot) {
      const imgPreview = document.createElement("img");
      imgPreview.className = "ghostrelay-popover-screenshot";
      imgPreview.src = entry.data.screenshot;
      popover.appendChild(header);
      popover.appendChild(imgPreview);
    } else {
      popover.appendChild(header);
    }

    // Edit area (shown on click)
    const editArea = document.createElement("div");
    editArea.className = "ghostrelay-popover-edit";

    const textarea = document.createElement("textarea");
    textarea.className = "ghostrelay-popover-text";
    textarea.placeholder = type === "snip" ? "Add a description\u2026" : "Describe what should change\u2026";
    textarea.value = entry.data.annotation || "";

    textarea.addEventListener("click", (e) => e.stopPropagation());
    textarea.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveAndClose(entry, type);
      }
    });
    textarea.addEventListener("keyup", (e) => e.stopPropagation());

    textarea.addEventListener("blur", () => {
      setTimeout(() => {
        if (Date.now() - popoverClosedAt < 200) return;
        if (!entry.popover || entry.popoverMode !== "edit") return;
        if (entry.popover.contains(document.activeElement)) return;
        saveAndClose(entry, type);
      }, 0);
    });

    // Footer with hint and remove button
    const footer = document.createElement("div");
    footer.className = "ghostrelay-popover-footer";

    const hint = document.createElement("span");
    hint.className = "ghostrelay-popover-hint";
    hint.innerHTML = '<kbd>Enter</kbd> to save';

    const removeBtn = document.createElement("button");
    removeBtn.className = "ghostrelay-popover-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (type === "snip") {
        const idx = snippedElements.indexOf(entry);
        if (idx !== -1) {
          entry.popoverMode = null;
          removeSnip(idx);
          syncTags();
        }
      } else {
        const idx = taggedElements.indexOf(entry);
        if (idx !== -1) {
          entry.popoverMode = null;
          removeTag(idx);
          syncTags();
        }
      }
    });

    footer.appendChild(hint);
    footer.appendChild(removeBtn);

    editArea.appendChild(textarea);
    editArea.appendChild(footer);
    popover.appendChild(preview);
    popover.appendChild(editArea);

    popover.addEventListener("mouseenter", () => {
      clearTimeout(popoverHideTimeout);
    });
    popover.addEventListener("mouseleave", () => {
      popoverHideTimeout = setTimeout(() => {
        if (entry.popoverMode === "edit" && entry.popover.contains(document.activeElement)) return;
        hidePopover(entry);
      }, 300);
    });

    document.documentElement.appendChild(popover);

    return popover;
  }

  function showPopover(entry, mode, type) {
    type = type || "tag";
    if (!entry.popover) {
      entry.popover = createPopover(entry, type);
    }
    const popover = entry.popover;
    entry.popoverMode = mode;

    if (mode === "preview") {
      if (!entry.data.annotation && type !== "snip") return;
      const preview = popover.querySelector(".ghostrelay-popover-preview");
      preview.textContent = entry.data.annotation || "";
      preview.style.display = entry.data.annotation ? "block" : "none";
      popover.querySelector(".ghostrelay-popover-edit").style.display = "none";
      // Show screenshot preview for snips
      const imgEl = popover.querySelector(".ghostrelay-popover-screenshot");
      if (imgEl) imgEl.style.display = "block";
    } else if (mode === "edit") {
      popover.querySelector(".ghostrelay-popover-preview").style.display = "none";
      const imgEl = popover.querySelector(".ghostrelay-popover-screenshot");
      if (imgEl) imgEl.style.display = "block";
      popover.querySelector(".ghostrelay-popover-edit").style.display = "flex";
      const textarea = popover.querySelector(".ghostrelay-popover-text");
      textarea.value = entry.data.annotation || "";
    }

    popover.style.display = "flex";
    positionPopover(popover, entry.badge);

    if (mode === "edit") {
      const textarea = popover.querySelector(".ghostrelay-popover-text");
      setTimeout(() => textarea.focus(), 0);
    }
  }

  function hidePopover(entry, force) {
    if (!entry.popover) return;
    if (!force && entry.popoverMode === "edit" && entry.popover.contains(document.activeElement)) {
      return;
    }
    entry.popover.style.display = "none";
    entry.popoverMode = null;
  }

  function saveAndClose(entry, type) {
    if (!entry.popover) return;
    const textarea = entry.popover.querySelector(".ghostrelay-popover-text");
    entry.data.annotation = textarea.value.trim() || undefined;
    entry.badge.classList.toggle("has-annotation", !!entry.data.annotation);
    hidePopover(entry, true);
    syncTags();
  }

  let popoverHideTimeout = null;
  // --- Tag Management ---
  function addTag(el) {
    const index = nextIndex++;
    const rect = el.getBoundingClientRect();

    const badge = document.createElement("span");
    badge.className = "ghostrelay-badge";
    badge.textContent = String(index);
    positionBadge(badge, el);
    document.documentElement.appendChild(badge);

    el.classList.add("ghostrelay-tagged");

    const data = {
      index,
      type: "tag",
      selector: getSelector(el),
      innerText: (el.innerText || "").trim().slice(0, 200),
      outerHTML: el.outerHTML.slice(0, 500),
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      pageURL: location.href,
      timestamp: new Date().toISOString(),
      tagName: el.tagName,
      attributes: getAttributes(el),
      parentContext: getParentContext(el),
      pageTitle: document.title,
    };

    const entry = { el, badge, popover: null, popoverMode: null, data };
    taggedElements.push(entry);
    updateFabCount();

    showPopover(entry, "edit", "tag");

    badge.addEventListener("mouseenter", () => {
      clearTimeout(popoverHideTimeout);
      if (entry.popoverMode !== "edit" && Date.now() - popoverClosedAt > 200) {
        showPopover(entry, "preview", "tag");
      }
    });
    badge.addEventListener("mouseleave", () => {
      popoverHideTimeout = setTimeout(() => {
        if (entry.popoverMode === "edit" && entry.popover && entry.popover.contains(document.activeElement)) return;
        hidePopover(entry, entry.popoverMode !== "edit");
      }, 300);
    });
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearTimeout(popoverHideTimeout);
      showPopover(entry, "edit", "tag");
    });

    if (screenshotEnabled) {
      captureElementScreenshot(el, taggedElements.length - 1);
    }
  }

  function removeTag(idx) {
    const entry = taggedElements[idx];
    entry.badge.remove();
    if (entry.popover) entry.popover.remove();
    entry.el.classList.remove("ghostrelay-tagged");
    taggedElements.splice(idx, 1);
    renumberAll();
    updateFabCount();
  }

  function renumberAll() {
    const all = [
      ...taggedElements.map((t) => ({ entry: t, type: "tag" })),
      ...snippedElements.map((s) => ({ entry: s, type: "snip" })),
    ].sort((a, b) => (a.entry.data.timestamp || "").localeCompare(b.entry.data.timestamp || ""));
    all.forEach((item, i) => {
      item.entry.data.index = i + 1;
      item.entry.badge.textContent = String(i + 1);
      if (item.type === "tag") {
        positionBadge(item.entry.badge, item.entry.el);
        if (item.entry.popover) positionPopover(item.entry.popover, item.entry.badge);
      }
    });
    nextIndex = all.length + 1;
  }

  function clearAllTags() {
    for (const t of taggedElements) {
      t.badge.remove();
      if (t.popover) t.popover.remove();
      t.el.classList.remove("ghostrelay-tagged");
    }
    taggedElements = [];
    if (snippedElements.length === 0) nextIndex = 1;
    updateFabCount();
  }

  // --- Snip Management ---
  function addSnip(screenshotDataUri, boundingBox, regionBox, canvas) {
    const index = nextIndex++;

    const badge = document.createElement("span");
    badge.className = "ghostrelay-badge-snip";
    badge.textContent = String(index);

    // Position badge at snip's top-right corner (absolute, scroll-adjusted)
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    badge.style.position = "absolute";
    badge.style.top = `${Math.max(4, boundingBox.y - 10) + scrollY}px`;
    badge.style.left = `${Math.min(window.innerWidth - 30, boundingBox.x + boundingBox.width - 10) + scrollX}px`;
    document.documentElement.appendChild(badge);

    const data = {
      index,
      type: "snip",
      screenshot: screenshotDataUri,
      boundingBox,
      pageURL: location.href,
      timestamp: new Date().toISOString(),
      pageTitle: document.title,
      scrollPosition: { x: scrollX, y: scrollY },
    };

    const entry = { badge, regionBox: regionBox || null, canvas: canvas || null, popover: null, popoverMode: null, data };
    snippedElements.push(entry);
    updateFabCount();

    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      editSnip(entry);
    });

    syncTags();
  }

  function removeSnip(idx) {
    const entry = snippedElements[idx];
    entry.badge.remove();
    if (entry.regionBox) entry.regionBox.remove();
    if (entry.canvas) entry.canvas.remove();
    if (entry.popover) entry.popover.remove();
    snippedElements.splice(idx, 1);
    renumberSnipBadges();
    updateFabCount();
  }

  function renumberSnipBadges() {
    renumberAll();
  }

  function clearAllSnips() {
    for (const s of snippedElements) {
      s.badge.remove();
      if (s.regionBox) s.regionBox.remove();
      if (s.canvas) s.canvas.remove();
      if (s.popover) s.popover.remove();
    }
    snippedElements = [];
    if (taggedElements.length === 0) nextIndex = 1;
    updateFabCount();
  }

  function updateFabCount() {
    const total = taggedElements.length + snippedElements.length;
    if (total > 0) {
      fab.textContent = String(total);
      fab.style.backgroundImage = "none";
    } else {
      fab.textContent = "";
      const iconUrl = chrome.runtime.getURL("icons/fab_icon.png");
      fab.style.backgroundImage = `url("${iconUrl}")`;
      fab.style.backgroundSize = "contain";
    }
    updateClearButton();
  }

  // --- Screenshot ---
  function captureElementScreenshot(el, idx) {
    const rect = el.getBoundingClientRect();
    chrome.runtime.sendMessage({ type: "capture-screenshot" }, (response) => {
      if (!response || !response.dataUrl) return;
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

  // --- Snipping Tool ---
  let selectionRect = null;
  let snipStartX = 0;
  let snipStartY = 0;
  let snipDragging = false;
  function startSnipOverlay() {
    document.documentElement.style.cursor = "crosshair";
    document.addEventListener("mousedown", onSnipMouseDown, true);
    document.addEventListener("mousemove", onSnipMouseMove, true);
    document.addEventListener("mouseup", onSnipMouseUp, true);
    document.addEventListener("keydown", onSnipKeyDown);
  }

  function removeSnipOverlay() {
    document.removeEventListener("mousedown", onSnipMouseDown, true);
    document.removeEventListener("mousemove", onSnipMouseMove, true);
    document.removeEventListener("mouseup", onSnipMouseUp, true);
    document.removeEventListener("keydown", onSnipKeyDown);
    document.documentElement.style.cursor = "";
    if (selectionRect) {
      selectionRect.remove();
      selectionRect = null;
    }
    snipDragging = false;
  }

  function onSnipKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      exitMode();
    }
  }

  function findSnipAtPoint(clientX, clientY) {
    for (const entry of snippedElements) {
      const b = entry.data.boundingBox;
      const sx = entry.data.scrollPosition ? entry.data.scrollPosition.x : 0;
      const sy = entry.data.scrollPosition ? entry.data.scrollPosition.y : 0;
      // Convert stored absolute coords back to viewport-relative
      const vx = b.x + sx - window.scrollX;
      const vy = b.y + sy - window.scrollY;
      if (clientX >= vx && clientX <= vx + b.width && clientY >= vy && clientY <= vy + b.height) {
        return entry;
      }
    }
    return null;
  }

  function onSnipMouseDown(e) {
    // Let clicks on GhostRelay UI and snip badges pass through
    if (isGhostRelayUI(e.target)) return;

    // Check if clicking on an existing snip region — open editor instead
    const hitSnip = findSnipAtPoint(e.clientX, e.clientY);
    if (hitSnip) {
      e.preventDefault();
      e.stopPropagation();
      removeSnipOverlay();
      editSnip(hitSnip);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    snipDragging = true;
    snipStartX = e.clientX;
    snipStartY = e.clientY;

    // Create selection rectangle
    if (selectionRect) selectionRect.remove();
    selectionRect = document.createElement("div");
    selectionRect.className = "ghostrelay-selection-rect";
    selectionRect.style.left = `${snipStartX}px`;
    selectionRect.style.top = `${snipStartY}px`;
    selectionRect.style.width = "0px";
    selectionRect.style.height = "0px";
    document.documentElement.appendChild(selectionRect);
  }

  function onSnipMouseMove(e) {
    if (!snipDragging || !selectionRect) return;
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, snipStartX);
    const y = Math.min(e.clientY, snipStartY);
    const w = Math.abs(e.clientX - snipStartX);
    const h = Math.abs(e.clientY - snipStartY);
    selectionRect.style.left = `${x}px`;
    selectionRect.style.top = `${y}px`;
    selectionRect.style.width = `${w}px`;
    selectionRect.style.height = `${h}px`;
  }

  function onSnipMouseUp(e) {
    if (!snipDragging) return;
    e.preventDefault();
    e.stopPropagation();
    snipDragging = false;

    const x = Math.min(e.clientX, snipStartX);
    const y = Math.min(e.clientY, snipStartY);
    const w = Math.abs(e.clientX - snipStartX);
    const h = Math.abs(e.clientY - snipStartY);

    // Ignore tiny selections
    if (w < 20 || h < 20) {
      if (selectionRect) {
        selectionRect.remove();
        selectionRect = null;
      }
      return;
    }

    const bounds = { x, y, width: w, height: h };
    openInlineAnnotation(bounds);
  }

  // --- Inline Annotation Editor ---
  let annotationCanvas = null;
  let annotationCtx = null;
  let annotationTool = "draw"; // 'draw' | 'text'
  let annotationColor = "#E8543E"; // default red
  let annotationDrawing = false;
  let annotationBounds = null;
  let inlineRegionBox = null;
  let inlineToolbar = null;
  let editingSnipEntry = null;
  let suppressNextClick = false;

  function onAnnotationClickOutside(e) {
    if (!annotationCanvas && !editingSnipEntry) return;
    // Ignore clicks on the canvas, toolbar, region, or text input
    const target = e.target;
    if (
      (annotationCanvas && annotationCanvas.contains(target)) ||
      (inlineToolbar && inlineToolbar.contains(target)) ||
      (inlineRegionBox && inlineRegionBox.contains(target)) ||
      target.closest(".ghostrelay-text-input")
    ) return;

    e.preventDefault();
    e.stopPropagation();
    if (editingSnipEntry) {
      updateSnipAnnotation(editingSnipEntry);
    } else {
      saveInlineAnnotation();
    }
    suppressNextClick = true;
  }

  function openInlineAnnotation(bounds) {
    // Pause snip overlay but stay in snip mode
    removeSnipOverlay();

    annotationBounds = bounds;

    // Create red-bordered region box (absolute, scroll-adjusted)
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    inlineRegionBox = document.createElement("div");
    inlineRegionBox.className = "ghostrelay-snip-region";
    inlineRegionBox.style.left = `${bounds.x + scrollX}px`;
    inlineRegionBox.style.top = `${bounds.y + scrollY}px`;
    inlineRegionBox.style.width = `${bounds.width}px`;
    inlineRegionBox.style.height = `${bounds.height}px`;
    inlineRegionBox.classList.add("ghostrelay-focus-overlay");
    document.documentElement.appendChild(inlineRegionBox);

    // Create canvas overlay on top of the region (absolute, scroll-adjusted)
    const dpr = window.devicePixelRatio || 1;
    annotationCanvas = document.createElement("canvas");
    annotationCanvas.className = "ghostrelay-inline-canvas";
    annotationCanvas.style.left = `${bounds.x + scrollX}px`;
    annotationCanvas.style.top = `${bounds.y + scrollY}px`;
    annotationCanvas.style.width = `${bounds.width}px`;
    annotationCanvas.style.height = `${bounds.height}px`;
    annotationCanvas.width = bounds.width * dpr;
    annotationCanvas.height = bounds.height * dpr;
    document.documentElement.appendChild(annotationCanvas);
    annotationCtx = annotationCanvas.getContext("2d");

    // Capture screenshot background before enabling interaction
    chrome.runtime.sendMessage({ type: "capture-screenshot" }, (response) => {
      if (response && response.dataUrl) {
        const img = new Image();
        img.onload = () => {
          annotationCtx.drawImage(
            img,
            bounds.x * dpr, bounds.y * dpr,
            bounds.width * dpr, bounds.height * dpr,
            0, 0,
            bounds.width * dpr, bounds.height * dpr
          );
          enableAnnotationInteraction(bounds);
        };
        img.src = response.dataUrl;
      } else {
        // Fallback: allow annotation even without background
        enableAnnotationInteraction(bounds);
      }
    });
  }

  function enableAnnotationInteraction(bounds) {
    // Create floating toolbar
    editingSnipEntry = null;
    inlineToolbar = buildInlineToolbar(bounds, () => saveInlineAnnotation(), () => closeInlineAnnotation(), () => closeInlineAnnotation());

    // Canvas event handlers
    annotationCanvas.addEventListener("mousedown", onAnnotationMouseDown);
    annotationCanvas.addEventListener("mousemove", onAnnotationMouseMove);
    annotationCanvas.addEventListener("mouseup", onAnnotationMouseUp);
    annotationCanvas.addEventListener("click", onAnnotationClick);
    document.addEventListener("keydown", onAnnotationKeyDown);
    document.addEventListener("mousedown", onAnnotationClickOutside, true);
  }

  function buildInlineToolbar(bounds, onSave, onCancel, onRemove) {
    const toolbar = document.createElement("div");
    toolbar.className = "ghostrelay-inline-toolbar";

    const drawBtn = createToolBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
      "Draw",
      () => { annotationTool = "draw"; updateToolActive(drawBtn); setColor("#E8543E"); if (annotationCanvas) annotationCanvas.style.cursor = "crosshair"; }
    );
    drawBtn.classList.add("active");

    const textBtn = createToolBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
      "Text",
      () => { annotationDrawing = false; if (annotationCtx) annotationCtx.beginPath(); annotationTool = "text"; updateToolActive(textBtn); setColor("#1a1a2e"); if (annotationCanvas) annotationCanvas.style.cursor = "text"; }
    );

    function updateToolActive(activeBtn) {
      toolbar.querySelectorAll(".ghostrelay-tool-btn").forEach((b) => b.classList.remove("active"));
      activeBtn.classList.add("active");
    }

    function setColor(hex) {
      annotationColor = hex;
      const name = { "#E8543E": "Red", "#1a1a2e": "Black", "#3B82F6": "Blue", "#22C55E": "Green", "#EAB308": "Yellow" }[hex];
      colorContainer.querySelectorAll(".ghostrelay-color-btn").forEach((b) => {
        b.classList.toggle("active", b.title === name);
      });
      const activeInput = document.querySelector(".ghostrelay-text-input");
      if (activeInput) activeInput.style.color = hex;
    }

    const sep1 = document.createElement("div");
    sep1.className = "ghostrelay-toolbar-sep";

    const colors = [
      { color: "#E8543E", name: "Red" },
      { color: "#3B82F6", name: "Blue" },
      { color: "#22C55E", name: "Green" },
      { color: "#EAB308", name: "Yellow" },
      { color: "#1a1a2e", name: "Black" },
    ];
    const colorContainer = document.createElement("div");
    colorContainer.className = "ghostrelay-color-container";
    colors.forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "ghostrelay-color-btn";
      if (i === 0) btn.classList.add("active");
      btn.style.background = c.color;
      btn.title = c.name;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        annotationColor = c.color;
        colorContainer.querySelectorAll(".ghostrelay-color-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        // Update any active text input color
        const activeInput = document.querySelector(".ghostrelay-text-input");
        if (activeInput) activeInput.style.color = c.color;
      });
      colorContainer.appendChild(btn);
    });

    const sep2 = document.createElement("div");
    sep2.className = "ghostrelay-toolbar-sep";

    const saveBtn = createToolBtn(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      "Save",
      onSave
    );
    saveBtn.classList.add("ghostrelay-tool-save");

    toolbar.appendChild(drawBtn);
    toolbar.appendChild(textBtn);
    toolbar.appendChild(sep1);
    toolbar.appendChild(colorContainer);
    toolbar.appendChild(sep2);
    toolbar.appendChild(saveBtn);

    if (onRemove) {
      const sep3 = document.createElement("div");
      sep3.className = "ghostrelay-toolbar-sep";
      const removeBtn = createToolBtn(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.5 14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
        "Remove",
        onRemove
      );
      removeBtn.classList.add("ghostrelay-tool-remove");
      toolbar.appendChild(sep3);
      toolbar.appendChild(removeBtn);
    }

    // Position toolbar above the region
    const toolbarHeight = 48;
    const toolbarGap = 8;
    let toolbarTop = bounds.y - toolbarHeight - toolbarGap;
    if (toolbarTop < 4) toolbarTop = bounds.y + bounds.height + toolbarGap;
    toolbar.style.left = `${bounds.x}px`;
    toolbar.style.top = `${toolbarTop}px`;
    document.documentElement.appendChild(toolbar);

    return toolbar;
  }

  function createToolBtn(svgHtml, title, onClick) {
    const btn = document.createElement("button");
    btn.className = "ghostrelay-tool-btn";
    btn.innerHTML = svgHtml;
    btn.title = title;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function onAnnotationKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (editingSnipEntry) {
        cancelEditSnip(editingSnipEntry);
      } else {
        closeInlineAnnotation();
      }
    }
  }

  // Drawing
  let lastDrawX = 0;
  let lastDrawY = 0;

  function getCanvasCoords(e) {
    const rect = annotationCanvas.getBoundingClientRect();
    const scaleX = annotationCanvas.width / rect.width;
    const scaleY = annotationCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onAnnotationMouseDown(e) {
    if (annotationTool !== "draw" || !annotationCtx) return;
    e.preventDefault();
    annotationDrawing = true;
    const coords = getCanvasCoords(e);
    lastDrawX = coords.x;
    lastDrawY = coords.y;
    annotationCtx.beginPath();
    annotationCtx.moveTo(coords.x, coords.y);
    annotationCtx.strokeStyle = annotationColor;
    annotationCtx.lineWidth = 3 * (window.devicePixelRatio || 1);
    annotationCtx.lineCap = "round";
    annotationCtx.lineJoin = "round";
  }

  function onAnnotationMouseMove(e) {
    if (!annotationDrawing || !annotationCtx) return;
    const coords = getCanvasCoords(e);
    annotationCtx.lineTo(coords.x, coords.y);
    annotationCtx.stroke();
    annotationCtx.beginPath();
    annotationCtx.moveTo(coords.x, coords.y);
    lastDrawX = coords.x;
    lastDrawY = coords.y;
  }

  function onAnnotationMouseUp(e) {
    if (annotationDrawing) {
      annotationDrawing = false;
      if (annotationCtx) annotationCtx.beginPath();
    }
  }

  // Text tool
  function onAnnotationClick(e) {
    if (annotationTool !== "text" || !annotationCtx) return;
    e.preventDefault();
    e.stopPropagation();

    const canvasRect = annotationCanvas.getBoundingClientRect();
    const inputX = e.clientX - canvasRect.left;
    const inputY = e.clientY - canvasRect.top;

    const input = document.createElement("input");
    input.className = "ghostrelay-text-input";
    input.style.left = `${e.clientX}px`;
    input.style.top = `${e.clientY}px`;
    input.style.color = annotationColor;
    document.documentElement.appendChild(input);
    input.focus();

    const commitText = () => {
      const text = input.value.trim();
      if (text && annotationCtx) {
        const coords = getCanvasCoords(e);
        const dpr = window.devicePixelRatio || 1;
        const fontSize = 14 * dpr;
        annotationCtx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const metrics = annotationCtx.measureText(text);
        const padding = 4 * dpr;

        // Draw background
        annotationCtx.fillStyle = "rgba(255, 255, 255, 0.85)";
        annotationCtx.fillRect(
          coords.x - padding,
          coords.y - fontSize - padding,
          metrics.width + padding * 2,
          fontSize + padding * 2
        );

        // Draw text
        annotationCtx.fillStyle = annotationColor;
        annotationCtx.fillText(text, coords.x, coords.y);
      }
      input.remove();
    };

    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitText();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        input.remove();
      }
    });
    input.addEventListener("blur", commitText);
  }

  function saveInlineAnnotation() {
    if (!annotationCanvas) return;

    const canvasDataUrl = annotationCanvas.toDataURL("image/png");
    const bounds = annotationBounds;
    const regionBox = inlineRegionBox;

    // Remove focus overlay
    if (regionBox) regionBox.classList.remove("ghostrelay-focus-overlay");

    // Remove event listeners but keep canvas visible
    const savedCanvas = annotationCanvas;
    if (annotationCanvas) {
      annotationCanvas.removeEventListener("mousedown", onAnnotationMouseDown);
      annotationCanvas.removeEventListener("mousemove", onAnnotationMouseMove);
      annotationCanvas.removeEventListener("mouseup", onAnnotationMouseUp);
      annotationCanvas.removeEventListener("click", onAnnotationClick);
      annotationCanvas.classList.add("ghostrelay-inline-canvas-saved");
    }
    if (inlineToolbar) {
      inlineToolbar.remove();
      inlineToolbar = null;
    }
    document.removeEventListener("keydown", onAnnotationKeyDown);
    document.removeEventListener("mousedown", onAnnotationClickOutside, true);
    annotationCanvas = null;
    annotationCtx = null;
    annotationBounds = null;
    inlineRegionBox = null;
    annotationDrawing = false;
    annotationTool = "draw";
    annotationColor = "#E8543E";

    addSnip(canvasDataUrl, bounds, regionBox, savedCanvas);

    if (currentMode === "snip") startSnipOverlay();
  }

  function closeInlineAnnotation() {
    if (annotationCanvas) {
      annotationCanvas.removeEventListener("mousedown", onAnnotationMouseDown);
      annotationCanvas.removeEventListener("mousemove", onAnnotationMouseMove);
      annotationCanvas.removeEventListener("mouseup", onAnnotationMouseUp);
      annotationCanvas.removeEventListener("click", onAnnotationClick);
      annotationCanvas.remove();
    }
    if (inlineToolbar) {
      inlineToolbar.remove();
      inlineToolbar = null;
    }
    if (inlineRegionBox) {
      inlineRegionBox.remove();
      inlineRegionBox = null;
    }
    document.removeEventListener("keydown", onAnnotationKeyDown);
    document.removeEventListener("mousedown", onAnnotationClickOutside, true);
    annotationCanvas = null;
    annotationCtx = null;
    annotationBounds = null;
    annotationDrawing = false;
    annotationTool = "draw";
    annotationColor = "#E8543E";

    if (currentMode === "snip") startSnipOverlay();
  }

  // --- Edit Snip ---
  function editSnip(entry) {
    // Set module-level annotation state from the saved canvas
    annotationCanvas = entry.canvas;
    annotationCtx = entry.canvas.getContext("2d");
    annotationBounds = entry.data.boundingBox;
    inlineRegionBox = entry.regionBox;
    editingSnipEntry = entry;

    // Show focus overlay
    if (inlineRegionBox) inlineRegionBox.classList.add("ghostrelay-focus-overlay");

    // Restore interactivity
    annotationCanvas.classList.remove("ghostrelay-inline-canvas-saved");

    // Build toolbar with remove option
    inlineToolbar = buildInlineToolbar(
      annotationBounds,
      () => updateSnipAnnotation(entry),
      () => cancelEditSnip(entry),
      () => removeSnipFromEditor(entry)
    );

    // Wire canvas event handlers
    annotationCanvas.addEventListener("mousedown", onAnnotationMouseDown);
    annotationCanvas.addEventListener("mousemove", onAnnotationMouseMove);
    annotationCanvas.addEventListener("mouseup", onAnnotationMouseUp);
    annotationCanvas.addEventListener("click", onAnnotationClick);
    document.addEventListener("keydown", onAnnotationKeyDown);
    document.addEventListener("mousedown", onAnnotationClickOutside, true);
  }

  function updateSnipAnnotation(entry) {
    if (!annotationCanvas) return;

    // Update screenshot data
    entry.data.screenshot = annotationCanvas.toDataURL("image/png");

    // Remove focus overlay
    if (inlineRegionBox) inlineRegionBox.classList.remove("ghostrelay-focus-overlay");

    // Deactivate canvas
    annotationCanvas.removeEventListener("mousedown", onAnnotationMouseDown);
    annotationCanvas.removeEventListener("mousemove", onAnnotationMouseMove);
    annotationCanvas.removeEventListener("mouseup", onAnnotationMouseUp);
    annotationCanvas.removeEventListener("click", onAnnotationClick);
    annotationCanvas.classList.add("ghostrelay-inline-canvas-saved");

    if (inlineToolbar) {
      inlineToolbar.remove();
      inlineToolbar = null;
    }
    document.removeEventListener("keydown", onAnnotationKeyDown);
    document.removeEventListener("mousedown", onAnnotationClickOutside, true);
    annotationCanvas = null;
    annotationCtx = null;
    annotationBounds = null;
    inlineRegionBox = null;
    editingSnipEntry = null;
    annotationDrawing = false;
    annotationTool = "draw";
    annotationColor = "#E8543E";

    syncTags();

    if (currentMode === "snip") startSnipOverlay();
  }

  function cancelEditSnip(entry) {
    if (!annotationCanvas) return;

    // Remove focus overlay
    if (inlineRegionBox) inlineRegionBox.classList.remove("ghostrelay-focus-overlay");

    annotationCanvas.removeEventListener("mousedown", onAnnotationMouseDown);
    annotationCanvas.removeEventListener("mousemove", onAnnotationMouseMove);
    annotationCanvas.removeEventListener("mouseup", onAnnotationMouseUp);
    annotationCanvas.removeEventListener("click", onAnnotationClick);
    annotationCanvas.classList.add("ghostrelay-inline-canvas-saved");

    if (inlineToolbar) {
      inlineToolbar.remove();
      inlineToolbar = null;
    }
    document.removeEventListener("keydown", onAnnotationKeyDown);
    document.removeEventListener("mousedown", onAnnotationClickOutside, true);

    annotationCanvas = null;
    annotationCtx = null;
    annotationBounds = null;
    inlineRegionBox = null;
    editingSnipEntry = null;
    annotationDrawing = false;
    annotationTool = "draw";
    annotationColor = "#E8543E";

    if (currentMode === "snip") startSnipOverlay();
  }

  function removeSnipFromEditor(entry) {
    // Clean up editor state
    if (annotationCanvas) {
      annotationCanvas.removeEventListener("mousedown", onAnnotationMouseDown);
      annotationCanvas.removeEventListener("mousemove", onAnnotationMouseMove);
      annotationCanvas.removeEventListener("mouseup", onAnnotationMouseUp);
      annotationCanvas.removeEventListener("click", onAnnotationClick);
    }
    if (inlineToolbar) {
      inlineToolbar.remove();
      inlineToolbar = null;
    }
    document.removeEventListener("keydown", onAnnotationKeyDown);
    document.removeEventListener("mousedown", onAnnotationClickOutside, true);
    annotationCanvas = null;
    annotationCtx = null;
    annotationBounds = null;
    inlineRegionBox = null;
    editingSnipEntry = null;
    annotationDrawing = false;
    annotationTool = "draw";
    annotationColor = "#E8543E";

    // Remove the snip
    const idx = snippedElements.indexOf(entry);
    if (idx !== -1) {
      removeSnip(idx);
      syncTags();
    }

    if (currentMode === "snip") startSnipOverlay();
  }

  // --- Sync to server ---
  function syncTags() {
    const tagData = taggedElements.map((t) => t.data);
    const snipData = snippedElements.map((s) => s.data);
    const elements = [...tagData, ...snipData];
    updateFabCount();
    const body = { pageURL: location.href, elements };
    fetch(`http://localhost:${serverPort}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Server not running — silently ignore
    });
  }

  // --- Event Handlers ---
  document.addEventListener(
    "mouseover",
    (e) => {
      if (!selectionMode) return;
      if (isGhostRelayUI(e.target)) return;
      if (hoveredEl) hoveredEl.classList.remove("ghostrelay-highlight");
      hoveredEl = e.target;
      hoveredEl.classList.add("ghostrelay-highlight");
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!selectionMode) return;
      if (e.target === hoveredEl) {
        hoveredEl.classList.remove("ghostrelay-highlight");
        hoveredEl = null;
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!selectionMode) return;
      if (isGhostRelayUI(e.target)) return;
      if (suppressNextClick) { suppressNextClick = false; return; }
      e.preventDefault();
      e.stopPropagation();

      if (Date.now() - popoverClosedAt < 200) return;

      const idx = findTagged(e.target);
      if (idx !== -1) {
        showPopover(taggedElements[idx], "edit", "tag");
        return;
      }
      addTag(e.target);
      syncTags();
    },
    true
  );

  // Close edit popover when clicking anywhere outside it
  let popoverClosedAt = 0;
  document.addEventListener("mousedown", (e) => {
    // Close open popovers
    const allEntries = [...taggedElements, ...snippedElements];
    const openEdit = allEntries.find((t) => t.popoverMode === "edit");
    if (!openEdit) return;
    if (isGhostRelayUI(e.target)) return;
    const type = taggedElements.includes(openEdit) ? "tag" : "snip";
    saveAndClose(openEdit, type);
    popoverClosedAt = Date.now();
  }, true);

  // Reposition badges and popovers on scroll/resize
  function repositionBadges() {
    taggedElements.forEach((t) => {
      positionBadge(t.badge, t.el);
      if (t.popover && t.popover.style.display !== "none") {
        positionPopover(t.popover, t.badge);
      }
    });
    // Snip badges don't reposition (they're viewport-based captures)
  }
  window.addEventListener("scroll", repositionBadges, { passive: true });
  window.addEventListener("resize", repositionBadges, { passive: true });
})();
