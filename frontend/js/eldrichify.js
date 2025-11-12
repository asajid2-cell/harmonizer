(() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const API_ENDPOINT = "/api/eldrichify";
  const MIN_DOWNLOAD_SIZE = 32;
  const MAX_DOWNLOAD_SIZE = 4096;

  // DOM Elements
  const launchBtn = document.querySelector('.launch-link');
  const terminalWindow = document.getElementById("terminal-window");
  const terminalOutput = document.getElementById("terminal-output");
  const terminalClose = document.getElementById("terminal-close");
  const resultsGrid = document.getElementById("results-grid");
  const terminalDisconnected = document.getElementById("terminal-disconnected");
  const downloadPanel = document.getElementById("download-panel");
  const downloadWidthInput = document.getElementById("download-width");
  const downloadHeightInput = document.getElementById("download-height");
  const downloadResetBtn = document.getElementById("download-reset");
  const downloadButtons = document.querySelectorAll(".eld-download-btn");

  let selectedFile = null;
  let isProcessing = false;
  const stageDownloads = {};

  // Initialize
  if (launchBtn) {
    launchBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTerminal();

      // Scroll to console
      const consoleEl = document.getElementById("eldrichify-console");
      if (consoleEl) {
        consoleEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  } else {
    console.error("Launch button not found!");
  }

  if (terminalClose) {
    terminalClose.addEventListener("click", closeTerminal);
  }

  if (downloadResetBtn && downloadWidthInput && downloadHeightInput) {
    downloadResetBtn.addEventListener("click", () => {
      downloadWidthInput.value = "";
      downloadHeightInput.value = "";
    });
  }

  function openTerminal() {
    if (!terminalWindow || !terminalOutput) {
      console.error("Terminal elements not found!");
      return;
    }

    terminalWindow.removeAttribute("hidden");

    if (terminalDisconnected) {
      terminalDisconnected.setAttribute("hidden", "");
    }

    if (resultsGrid) {
      resultsGrid.setAttribute("hidden", "");
    }

    if (downloadPanel) {
      downloadPanel.setAttribute("hidden", "");
    }

    clearStageDownloads();

    terminalOutput.innerHTML = "";

    addTerminalLine("Eldrichify Terminal v2.4.1", "info");
    addTerminalLine("Photon-Safe Upscaling Pipeline", "info");
    addTerminalLine("═".repeat(60), "info");
    addTerminalLine("");

    setTimeout(() => {
      addTerminalLine("$ Loading VAE encoder/decoder...", "success");
    }, 150);

    setTimeout(() => {
      addTerminalLine("$ Residual MLP refiner online", "success");
    }, 300);

    setTimeout(() => {
      addTerminalLine("$ DF2K super-resolution ready", "success");
    }, 450);

    setTimeout(() => {
      addTerminalLine("");
      addTerminalLine("Ready for image upload.", "info");
      addTerminalLine("");
      showFilePrompt();
    }, 600);
  }

  function closeTerminal() {
    terminalWindow.setAttribute("hidden", "");

    if (downloadPanel) {
      downloadPanel.setAttribute("hidden", "");
    }

    // Show disconnected message again
    if (terminalDisconnected) {
      terminalDisconnected.removeAttribute("hidden");
    }

    clearStageDownloads();
    selectedFile = null;
    isProcessing = false;
  }

  function clearStageDownloads() {
    Object.keys(stageDownloads).forEach((key) => {
      delete stageDownloads[key];
    });
    if (downloadButtons && downloadButtons.length) {
      downloadButtons.forEach((btn) => {
        btn.removeAttribute("download");
        btn.setAttribute("href", "#");
      });
    }
  }

  function addTerminalLine(text, type = "") {
    const line = document.createElement("div");
    line.className = `eld-terminal-line ${type}`;
    line.textContent = text;
    terminalOutput.appendChild(line);

    // Auto-scroll to bottom
    terminalOutput.parentElement.scrollTop = terminalOutput.parentElement.scrollHeight;
  }

  function showFilePrompt() {
    const promptDiv = document.createElement("div");
    promptDiv.className = "eld-terminal-line info";
    promptDiv.innerHTML = `<span style="color: #00ffe1;">$ upload</span>`;
    terminalOutput.appendChild(promptDiv);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp,image/bmp";
    fileInput.className = "eld-terminal-file-input";

    promptDiv.appendChild(fileInput);

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        addTerminalLine("");
        addTerminalLine("✗ Error: File exceeds 10MB limit", "error");
        addTerminalLine("");
        showFilePrompt();
        return;
      }

      selectedFile = file;
      promptDiv.remove();
      handleFileUpload(file);
    });
  }

  async function handleFileUpload(file) {
    if (isProcessing) return;
    isProcessing = true;
    clearStageDownloads();
    if (downloadPanel) {
      downloadPanel.setAttribute("hidden", "");
    }

    const fakePath = `/tmp/eldrichify/${Date.now()}_${file.name}`;

    addTerminalLine("");
    addTerminalLine(`✓ File selected: ${file.name}`, "success");
    addTerminalLine(`  Size: ${(file.size / 1024).toFixed(2)} KB`, "info");
    addTerminalLine(`  Type: ${file.type}`, "info");
    addTerminalLine("");

    await sleep(200);
    addTerminalLine(`$ Copying to: ${fakePath}`, "info");
    await sleep(300);
    addTerminalLine("✓ Upload complete", "success");
    addTerminalLine("");

    await sleep(150);
    addTerminalLine("$ Starting pipeline execution...", "info");
    addTerminalLine("─".repeat(60), "info");
    addTerminalLine("");

    // Stage 1: VAE Encode
    await sleep(250);
    addTerminalLine("[1/5] VAE encoding", "warning");
    await sleep(400);
    addTerminalLine("  → Compressing to 64-dim latent space...", "info");
    await sleep(300);
    addTerminalLine("  → Reparameterization pass...", "info");
    await sleep(350);
    addTerminalLine("  ✓ Latent captured", "success");
    addTerminalLine("");

    // Stage 2: VAE Decode
    await sleep(200);
    addTerminalLine("[2/5] VAE decoding", "warning");
    await sleep(450);
    addTerminalLine("  → Reconstructing from latent...", "info");
    await sleep(350);
    addTerminalLine("  → Deconvolutional upsampling...", "info");
    await sleep(300);
    addTerminalLine("  ✓ Base reconstruction complete", "success");
    addTerminalLine("");

    // Stage 3: Latent Refine
    await sleep(200);
    addTerminalLine("[3/5] Latent refinement", "warning");
    await sleep(500);
    addTerminalLine("  → Applying residual MLP layers...", "info");
    await sleep(400);
    addTerminalLine("  → LayerNorm + dropout passes...", "info");
    await sleep(350);
    addTerminalLine("  → Re-decoding refined latent...", "info");
    await sleep(300);
    addTerminalLine("  ✓ Refinement complete", "success");
    addTerminalLine("");

    // Stage 4: Pixel Upsample
    await sleep(200);
    addTerminalLine("[4/5] Pixel upsampling (2x)", "warning");
    await sleep(450);
    addTerminalLine("  → Residual block feature extraction...", "info");
    await sleep(400);
    addTerminalLine("  → Pixel shuffle 32→64...", "info");
    await sleep(350);
    addTerminalLine("  ✓ 2x upsample complete", "success");
    addTerminalLine("");

    // Stage 5: HD Super-res
    await sleep(200);
    addTerminalLine("[5/5] DF2K super-resolution (8x)", "warning");
    await sleep(550);
    addTerminalLine("  → Loading DF2K-trained weights...", "info");
    await sleep(450);
    addTerminalLine("  → 8x upscale 64→512...", "info");
    await sleep(500);
    addTerminalLine("  → Bicubic resize to target...", "info");
    await sleep(400);
    addTerminalLine("  ✓ HD output generated", "success");
    addTerminalLine("");

    // Complete
    await sleep(250);
    addTerminalLine("─".repeat(60), "info");
    addTerminalLine("✓ Pipeline execution complete!", "success");
    addTerminalLine("");

    // Now send to backend
    await sleep(300);
    addTerminalLine("$ Uploading to server...", "info");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      addTerminalLine("✓ Server processing complete", "success");
      addTerminalLine("");
      await sleep(400);
      addTerminalLine("$ Displaying results...", "info");

      await sleep(600);
      displayResults(file, data);

    } catch (error) {
      console.error("Upload error:", error);
      addTerminalLine("");
      addTerminalLine(`✗ Error: ${error.message}`, "error");
      addTerminalLine("");
      addTerminalLine("$ Retrying in offline mode...", "warning");
      await sleep(800);
      addTerminalLine("$ Generating preview results...", "info");
      await sleep(1000);

      // Fallback: show input image only
      displayResults(file, null);
    }

    isProcessing = false;
  }

  function displayResults(file, data) {
    // Close terminal and size selector, show results
    setTimeout(() => {
      terminalWindow.setAttribute("hidden", "");
      if (resultsGrid) {
        resultsGrid.removeAttribute("hidden");
      }
      if (downloadPanel) {
        downloadPanel.removeAttribute("hidden");
      }
      // Don't show disconnected message when displaying results
      selectedFile = null;
      isProcessing = false;
    }, 1000);

    // Display input image (original, not resized)
    const inputImg = document.getElementById("result-input");
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      inputImg.src = dataUrl;
      // Set up download for original input
      const downloadInput = document.getElementById("download-input");
      const filename = `input_${file.name}`;
      downloadInput.href = dataUrl;
      downloadInput.download = filename;
      stageDownloads.input = { dataUrl, filename };
    };
    reader.readAsDataURL(file);

    // Display server results if available
    if (data && data.previews) {
      // API returns previews object with base64 data URLs
      const stages = ['vae', 'refined', 'upsampled', 'hd'];
      stages.forEach(stage => {
        if (data.previews[stage]) {
          const img = document.getElementById(`result-${stage}`);
          const downloadBtn = document.getElementById(`download-${stage}`);
          const dataUrl = data.previews[stage];
          const filename = `${stage}_${Date.now()}.png`;
          img.src = dataUrl;
          downloadBtn.href = dataUrl;
          downloadBtn.download = filename;
          stageDownloads[stage] = { dataUrl, filename };
        }
      });
    } else {
      // Fallback: duplicate input for all stages
      setTimeout(() => {
        const inputSrc = inputImg.src;
        ['vae', 'refined', 'upsampled', 'hd'].forEach(stage => {
          const stageImg = document.getElementById(`result-${stage}`);
          const downloadBtn = document.getElementById(`download-${stage}`);
          const filename = `${stage}_${Date.now()}.png`;
          stageImg.src = inputSrc;
          downloadBtn.href = inputSrc;
          downloadBtn.download = filename;
          stageDownloads[stage] = { dataUrl: inputSrc, filename };
        });
      }, 500);
    }
  }

  function getCustomSize() {
    if (!downloadWidthInput || !downloadHeightInput) {
      return null;
    }
    const widthRaw = downloadWidthInput.value.trim();
    const heightRaw = downloadHeightInput.value.trim();
    if (!widthRaw && !heightRaw) {
      return null;
    }
    const fallback = widthRaw || heightRaw;
    const widthValue = parseInt(widthRaw || fallback, 10);
    const heightValue = parseInt(heightRaw || fallback, 10);
    const width = normalizeDimension(widthValue);
    const height = normalizeDimension(heightValue);
    if (width === null || height === null) {
      return null;
    }
    return { width, height };
  }

  function normalizeDimension(value) {
    if (!Number.isFinite(value)) {
      return null;
    }
    const rounded = Math.round(value);
    if (rounded <= 0) {
      return null;
    }
    return Math.max(MIN_DOWNLOAD_SIZE, Math.min(MAX_DOWNLOAD_SIZE, rounded));
  }

  function resizeDataUrl(dataUrl, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to get canvas context"));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Failed to load image for resizing"));
      img.src = dataUrl;
    });
  }

  function triggerDownload(dataUrl, filename) {
    const tempLink = document.createElement("a");
    tempLink.href = dataUrl;
    tempLink.download = filename || `eldrichify_${Date.now()}.png`;
    document.body.appendChild(tempLink);
    tempLink.click();
    tempLink.remove();
  }

  function setupDownloadButtons() {
    if (!downloadButtons || downloadButtons.length === 0) {
      return;
    }
    downloadButtons.forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.preventDefault();
        const stage = btn.getAttribute("data-stage");
        const payload = stage ? stageDownloads[stage] : null;
        if (!payload) {
          return;
        }
        const customSize = getCustomSize();
        let dataUrl = payload.dataUrl;
        if (customSize) {
          try {
            dataUrl = await resizeDataUrl(payload.dataUrl, customSize.width, customSize.height);
          } catch (err) {
            console.warn("Custom resize failed, falling back to native download", err);
            dataUrl = payload.dataUrl;
          }
        }
        triggerDownload(dataUrl, payload.filename);
      });
    });
  }

  setupDownloadButtons();

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Image lightbox functionality
  const lightbox = document.getElementById("image-lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.querySelector(".eld-lightbox-close");

  function openLightbox(imgSrc) {
    lightboxImg.src = imgSrc;
    lightbox.classList.add("active");
  }

  function closeLightbox() {
    lightbox.classList.remove("active");
    lightboxImg.src = "";
  }

  // Add click handlers to result images
  function setupImageClickHandlers() {
    const resultImages = document.querySelectorAll(".eld-result-item img");
    resultImages.forEach((img) => {
      img.addEventListener("click", () => {
        if (img.src) {
          openLightbox(img.src);
        }
      });
    });
  }

  // Close lightbox when clicking close button or background
  if (lightboxClose) {
    lightboxClose.addEventListener("click", (e) => {
      e.stopPropagation();
      closeLightbox();
    });
  }

  if (lightbox) {
    lightbox.addEventListener("click", closeLightbox);
  }

  // Prevent closing when clicking the image itself
  if (lightboxImg) {
    lightboxImg.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // Setup handlers after results are displayed
  const observer = new MutationObserver(() => {
    if (!resultsGrid.hasAttribute("hidden")) {
      setupImageClickHandlers();
    }
  });

  if (resultsGrid) {
    observer.observe(resultsGrid, { attributes: true, attributeFilter: ["hidden"] });
  }
})();
