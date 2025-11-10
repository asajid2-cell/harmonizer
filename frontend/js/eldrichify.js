(() => {
  const form = document.getElementById("eldrichify-form");
  if (!form) {
    return;
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const GALLERY_STORAGE_KEY = "eldrichify-gallery";
  const stageFilters = [
    { key: "capture", label: "Capture", filter: "grayscale(0.2) brightness(1.1) contrast(0.8)" },
    { key: "latent", label: "Latent Refine", filter: "saturate(1.3) contrast(1.2)" },
    { key: "pixel", label: "Pixel Stretch", filter: "contrast(1.35) saturate(1.4)" },
  ];

  const fileInput = document.getElementById("eldrichify-input");
  const dropzone = document.getElementById("eldrichify-dropzone");
  const selectionNode = document.getElementById("eldrichify-selection");
  const submitBtn = document.getElementById("eldrichify-submit");
  const statusNode = document.getElementById("eldrichify-status");
  const spinner = document.getElementById("eldrichify-spinner");
  const resultsSection = document.getElementById("eldrichify-results");
  const placeholder = document.getElementById("eldrichify-placeholder");
  const resultImage = document.getElementById("eldrichify-result-image");
  const downloadLink = document.getElementById("eldrichify-download");
  const metaNode = document.getElementById("eldrichify-meta");
  const stagesGrid = document.getElementById("eldrichify-stages");
  const galleryGrid = document.getElementById("eldrichify-gallery");
  const clearGalleryBtn = document.getElementById("eldrichify-clear-gallery");
  const logList = document.getElementById("eldrichify-log");

  let pendingFile = null;
  let galleryEntries = loadGallery();
  renderGallery();

  form.addEventListener("submit", handleSubmit);
  fileInput.addEventListener("change", handleInputChange);
  clearGalleryBtn?.addEventListener("click", handleClearGallery);
  galleryGrid?.addEventListener("click", handleGalleryClick);

  setupDropzone(dropzone);

  function handleSubmit(event) {
    event.preventDefault();
    const file = pendingFile || fileInput.files[0];
    if (!file) {
      setStatus("Please choose an image first.", true);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus("Image is too large. Keep it under 10 MB.", true);
      return;
    }
    processFile(file);
  }

  function handleInputChange() {
    pendingFile = fileInput.files[0] || null;
    selectionNode.textContent = pendingFile ? `Selected: ${pendingFile.name}` : "No file selected yet.";
    if (pendingFile) {
      setStatus("Ready to run the pipeline.");
    }
  }

  function setupDropzone(node) {
    if (!node) return;
    ["dragenter", "dragover"].forEach((eventName) => {
      node.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        node.classList.add("is-hover");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      node.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (eventName === "drop") {
          const file = event.dataTransfer?.files?.[0];
          if (file) {
            pendingFile = file;
            selectionNode.textContent = `Selected: ${file.name}`;
            setStatus("Drop received. Run the pipeline when ready.");
          }
        }
        node.classList.remove("is-hover");
      });
    });
  }

  async function processFile(file) {
    try {
      setLoading(true);
      setStatus("Booting up the neon stack...");
      logEvent(`Processing ${file.name}`);
      const dataUrl = await readFileAsDataURL(file);
      const dimensions = await getImageDimensions(dataUrl);
      const record = {
        id: generateId(),
        name: file.name,
        size: file.size,
        width: dimensions.width,
        height: dimensions.height,
        dataUrl,
        createdAt: new Date().toISOString(),
      };
      renderResult(record);
      addToGallery(record);
      pendingFile = null;
      fileInput.value = "";
      selectionNode.textContent = "No file selected yet.";
      setStatus("Neon alchemy complete.");
    } catch (error) {
      console.error("[eldrichify] failed", error);
      setStatus(error instanceof Error ? error.message : "Something went wrong.", true);
    } finally {
      setLoading(false);
    }
  }

  function renderResult(record) {
    if (!record?.dataUrl) {
      return;
    }
    if (placeholder) {
      placeholder.hidden = true;
    }
    if (resultsSection) {
      resultsSection.hidden = false;
    }

    if (resultImage) {
      resultImage.src = record.dataUrl;
      resultImage.alt = `Eldrichified result ${record.name}`;
    }
    if (downloadLink) {
      downloadLink.href = record.dataUrl;
      downloadLink.download = sanitizeFileName(record.name) || "eldrichified.png";
    }
    if (metaNode) {
      metaNode.textContent = `${record.width}x${record.height} · ${formatFileSize(record.size)}`;
    }
    renderStages(record.dataUrl);
  }

  function renderStages(dataUrl) {
    if (!stagesGrid) return;
    stagesGrid.innerHTML = "";
    stageFilters.forEach((stage) => {
      const card = document.createElement("article");
      card.className = "eldrichify-stage-card";
      const title = document.createElement("strong");
      title.textContent = stage.label;
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = `${stage.label} preview`;
      img.style.filter = stage.filter;
      card.append(title, img);
      stagesGrid.appendChild(card);
    });
  }

  function renderGallery() {
    if (!galleryGrid) return;
    if (!Array.isArray(galleryEntries) || galleryEntries.length === 0) {
      galleryGrid.dataset.empty = "true";
      galleryGrid.innerHTML = '<p class="eld-gallery__empty">No reels yet. Once you upload, your latest six will land here.</p>';
      return;
    }

    galleryGrid.dataset.empty = "false";
    galleryGrid.innerHTML = "";
    galleryEntries.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "eld-gallery-card";
      card.dataset.id = entry.id;

      const badge = document.createElement("span");
      badge.className = "eld-gallery-card__badge";
      badge.textContent = "SESSION";

      const img = document.createElement("img");
      img.src = entry.dataUrl;
      img.alt = `Gallery preview for ${entry.name}`;

      const meta = document.createElement("div");
      meta.className = "eld-gallery-card__meta";
      meta.innerHTML = `
        <strong>${entry.name}</strong>
        <span>${entry.width}x${entry.height} · ${formatFileSize(entry.size)}</span>
        <span>${formatTimestamp(entry.createdAt)}</span>
      `;

      card.append(badge, img, meta);
      galleryGrid.appendChild(card);
    });
  }

  function addToGallery(record) {
    if (!Array.isArray(galleryEntries)) {
      galleryEntries = [];
    }
    galleryEntries.unshift(record);
    galleryEntries = galleryEntries.slice(0, 6);
    saveGallery();
    renderGallery();
  }

  function handleGalleryClick(event) {
    const card = event.target.closest(".eld-gallery-card");
    if (!card) return;
    const { id } = card.dataset;
    const record = galleryEntries.find((entry) => entry.id === id);
    if (record) {
      renderResult(record);
      setStatus(`Loaded ${record.name} from the archive.`);
    }
  }

  function handleClearGallery() {
    galleryEntries = [];
    saveGallery();
    renderGallery();
    setStatus("Cleared the local archive.");
  }

  function setStatus(message, isError = false) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle("error", Boolean(isError));
  }

  function setLoading(isLoading) {
    if (submitBtn) {
      submitBtn.disabled = isLoading;
    }
    if (spinner) {
      spinner.hidden = !isLoading;
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Unsupported file result."));
        }
      };
      reader.onerror = () => reject(new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  function getImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Unable to inspect image dimensions."));
      img.src = dataUrl;
    });
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return "0 B";
    const units = ["B", "KB", "MB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function sanitizeFileName(name) {
    return (name || "").replace(/[^\w.-]/g, "_");
  }

  function loadGallery() {
    try {
      const stored = localStorage.getItem(GALLERY_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn("[eldrichify] unable to load gallery", error);
      return [];
    }
  }

  function saveGallery() {
    try {
      localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(galleryEntries));
    } catch (error) {
      console.warn("[eldrichify] unable to persist gallery", error);
    }
  }

  function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `eld-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function logEvent(message) {
    if (!logList) return;
    const entry = document.createElement("li");
    entry.innerHTML = `<span>${message}</span><span>${new Date().toLocaleTimeString()}</span>`;
    logList.prepend(entry);
    while (logList.children.length > 4) {
      logList.removeChild(logList.lastChild);
    }
  }
})();
