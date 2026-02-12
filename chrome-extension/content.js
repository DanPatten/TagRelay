(() => {
  // Prevent double-injection
  if (window.__ghostrelay_loaded) return;
  window.__ghostrelay_loaded = true;

  let selectionMode = false;
  let taggedElements = []; // { el, badge, popover, popoverMode, data }
  let hoveredEl = null;
  let serverPort = 7391;
  let screenshotEnabled = false;
  let enabled = false;
  let eventSource = null;
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
    if (!enabled && selectionMode) {
      toggleSelectionMode();
    }
  }

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
  fab.id = "ghostrelay-fab";
  fab.classList.add("ghostrelay-disabled"); // Start hidden until storage loads
  const iconUrl = chrome.runtime.getURL("icons/fab_icon.png");
  fab.style.backgroundImage = `url("${iconUrl}")`;
  fab.style.backgroundSize = "contain";
  fab.style.backgroundPosition = "center";
  fab.style.backgroundRepeat = "no-repeat";
  fab.title = "GhostRelay — Click to start tagging elements";
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleSelectionMode();
  });
  document.documentElement.appendChild(fab);

  // --- Clear Button (trash icon, shown in selection mode) ---
  const btnClear = document.createElement("button");
  btnClear.id = "ghostrelay-btn-clear";
  btnClear.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1.5 14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  btnClear.title = "Clear all tags";
  btnClear.style.display = "none";
  btnClear.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    clearAllTags();
    syncTags();
  });
  document.documentElement.appendChild(btnClear);

  // --- Selection Mode ---
  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    fab.classList.toggle("active", selectionMode);
    updateClearButton();
    if (!selectionMode && hoveredEl) {
      hoveredEl.classList.remove("ghostrelay-highlight");
      hoveredEl = null;
    }
  }

  function updateClearButton() {
    btnClear.style.display = (selectionMode && taggedElements.length > 0) ? "flex" : "none";
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

  // --- Tagging ---
  function isGhostRelayUI(el) {
    if (!el || !el.closest) return false;
    return (
      el === fab ||
      el.closest("#ghostrelay-fab") ||
      el.closest("#ghostrelay-btn-clear") ||
      el.closest(".ghostrelay-badge") ||
      el.closest(".ghostrelay-popover")
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

    // Use known width (textarea 280px) and estimate height
    const popW = popover.offsetWidth || 280;
    const popH = popover.offsetHeight || 160;

    // Default: below badge, left-aligned to badge
    let top = badgeRect.bottom + 6;
    let left = badgeRect.left;

    // Clamp right edge
    if (left + popW > window.innerWidth - margin) {
      left = window.innerWidth - popW - margin;
    }
    // Clamp left edge
    if (left < margin) {
      left = margin;
    }
    // Clamp bottom — flip above badge
    if (top + popH > window.innerHeight - margin) {
      top = badgeRect.top - popH - 6;
    }
    // Clamp top
    if (top < margin) {
      top = margin;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function createPopover(entry) {
    const popover = document.createElement("div");
    popover.className = "ghostrelay-popover";
    popover.style.display = "none";

    // Header bar
    const header = document.createElement("div");
    header.className = "ghostrelay-popover-header";
    const headerIcon = document.createElement("svg");
    headerIcon.className = "ghostrelay-popover-header-icon";
    headerIcon.setAttribute("viewBox", "0 0 24 24");
    headerIcon.setAttribute("fill", "none");
    headerIcon.setAttribute("stroke", "currentColor");
    headerIcon.setAttribute("stroke-width", "2");
    headerIcon.setAttribute("stroke-linecap", "round");
    headerIcon.setAttribute("stroke-linejoin", "round");
    headerIcon.innerHTML = '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>';
    header.appendChild(headerIcon);
    header.appendChild(document.createTextNode(`Tag #${entry.data.index}`));

    // Preview label (shown on hover)
    const preview = document.createElement("div");
    preview.className = "ghostrelay-popover-preview";

    // Edit area (shown on click)
    const editArea = document.createElement("div");
    editArea.className = "ghostrelay-popover-edit";

    const textarea = document.createElement("textarea");
    textarea.className = "ghostrelay-popover-text";
    textarea.placeholder = "Describe what should change\u2026";
    textarea.value = entry.data.annotation || "";

    textarea.addEventListener("click", (e) => e.stopPropagation());
    textarea.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveAndClose(entry);
      }
    });
    textarea.addEventListener("keyup", (e) => e.stopPropagation());

    textarea.addEventListener("blur", () => {
      // Delay to check if focus moved to Remove button (which fires mousedown first)
      setTimeout(() => {
        // If the popover was just closed by mousedown, don't double-close
        if (Date.now() - popoverClosedAt < 200) return;
        // If entry was already removed or popover closed, bail
        if (!entry.popover || entry.popoverMode !== "edit") return;
        // If focus moved to another element inside the popover, don't close
        if (entry.popover.contains(document.activeElement)) return;
        saveAndClose(entry);
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
      const idx = taggedElements.indexOf(entry);
      if (idx !== -1) {
        entry.popoverMode = null; // prevent blur handler from running
        removeTag(idx);
        syncTags();
      }
    });

    footer.appendChild(hint);
    footer.appendChild(removeBtn);

    editArea.appendChild(textarea);
    editArea.appendChild(footer);
    popover.appendChild(header);
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

  function showPopover(entry, mode) {
    if (!entry.popover) {
      entry.popover = createPopover(entry);
    }
    const popover = entry.popover;
    entry.popoverMode = mode;

    if (mode === "preview") {
      if (!entry.data.annotation) return; // nothing to preview
      const preview = popover.querySelector(".ghostrelay-popover-preview");
      preview.textContent = entry.data.annotation;
      preview.style.display = "block";
      popover.querySelector(".ghostrelay-popover-edit").style.display = "none";
    } else if (mode === "edit") {
      popover.querySelector(".ghostrelay-popover-preview").style.display = "none";
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
    // Don't close edit mode if textarea is focused (unless forced)
    if (!force && entry.popoverMode === "edit" && entry.popover.contains(document.activeElement)) {
      return;
    }
    entry.popover.style.display = "none";
    entry.popoverMode = null;
  }

  function saveAndClose(entry) {
    if (!entry.popover) return;
    const textarea = entry.popover.querySelector(".ghostrelay-popover-text");
    entry.data.annotation = textarea.value.trim() || undefined;
    entry.badge.classList.toggle("has-annotation", !!entry.data.annotation);
    hidePopover(entry, true);
    syncTags();
  }

  let popoverHideTimeout = null;

  function addTag(el) {
    const index = taggedElements.length + 1;
    const rect = el.getBoundingClientRect();

    const badge = document.createElement("span");
    badge.className = "ghostrelay-badge";
    badge.textContent = String(index);
    positionBadge(badge, el);
    document.documentElement.appendChild(badge);

    el.classList.add("ghostrelay-tagged");

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
      tagName: el.tagName,
      attributes: getAttributes(el),
      parentContext: getParentContext(el),
      pageTitle: document.title,
    };

    const entry = { el, badge, popover: null, popoverMode: null, data };
    taggedElements.push(entry);
    updateFabCount();

    // Show edit popover on first tag
    showPopover(entry, "edit");

    // Hover: show preview (annotation text only)
    badge.addEventListener("mouseenter", () => {
      clearTimeout(popoverHideTimeout);
      if (entry.popoverMode !== "edit" && Date.now() - popoverClosedAt > 200) {
        showPopover(entry, "preview");
      }
    });
    badge.addEventListener("mouseleave", () => {
      popoverHideTimeout = setTimeout(() => {
        if (entry.popoverMode === "edit" && entry.popover && entry.popover.contains(document.activeElement)) return;
        hidePopover(entry, entry.popoverMode !== "edit");
      }, 300);
    });
    // Click: show edit mode
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      clearTimeout(popoverHideTimeout);
      showPopover(entry, "edit");
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
    renumberBadges();
    updateFabCount();
  }

  function renumberBadges() {
    taggedElements.forEach((t, i) => {
      t.data.index = i + 1;
      t.badge.textContent = String(i + 1);
      positionBadge(t.badge, t.el);
      if (t.popover) positionPopover(t.popover, t.badge);
    });
  }

  function clearAllTags() {
    for (const t of taggedElements) {
      t.badge.remove();
      if (t.popover) t.popover.remove();
      t.el.classList.remove("ghostrelay-tagged");
    }
    taggedElements = [];
    updateFabCount();
  }

  function updateFabCount() {
    if (taggedElements.length > 0) {
      fab.textContent = String(taggedElements.length);
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
      e.preventDefault();
      e.stopPropagation();

      // If a popover was just closed by mousedown, don't select the element
      if (Date.now() - popoverClosedAt < 200) return;

      const idx = findTagged(e.target);
      if (idx !== -1) {
        showPopover(taggedElements[idx], "edit");
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
    const openEdit = taggedElements.find((t) => t.popoverMode === "edit");
    if (!openEdit) return;
    if (isGhostRelayUI(e.target)) return;
    saveAndClose(openEdit);
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
  }
  window.addEventListener("scroll", repositionBadges, { passive: true });
  window.addEventListener("resize", repositionBadges, { passive: true });
})();
