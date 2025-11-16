(() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const API_ENDPOINT = "/api/eldrichify";
  const PROMPT_ENDPOINT = "/api/imgen";
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
  let currentMode = null;
  const stageDownloads = {};
  const pendingStagePreviews = new Map();
  const UPLOAD_STAGE_ORDER = ["input32", "vae", "refined", "upsampled", "hd"];
  const PROMPT_STAGE_ORDER = ["tokens", "latent", "guidance", "diffusion", "hd"];
  const STAGE_PREVIEW_META = {
    input32: { label: "[S0] Input capture (32x32)", alt: "Input capture preview" },
    vae: { label: "[S1] Base decode (VAE)", alt: "VAE decode preview" },
    refined: { label: "[S2] Latent refinement", alt: "Refined preview" },
    upsampled: { label: "[S3] Pixel upsample 2x", alt: "Upsampled preview" },
    hd: { label: "[S4] Final HD output", alt: "HD output preview" },
    tokens: { label: "[S0] Token embeddings", alt: "Tokenization visualization" },
    latent: { label: "[S1] Latent noise field", alt: "Latent noise visualization" },
    guidance: { label: "[S2] Guidance fusion", alt: "Guidance visualization" },
    diffusion: { label: "[S3] Diffusion process", alt: "Diffusion visualization" },
  };

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
    pendingStagePreviews.clear();

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
      addTerminalLine("Ready for pipeline selection.", "info");
      addTerminalLine("");
      showModePrompt();
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

    pendingStagePreviews.clear();
    clearStageDownloads();
    selectedFile = null;
    isProcessing = false;
    currentMode = null;
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

  function queueStagePreview(stageKey) {
    if (!terminalOutput || !stageKey || pendingStagePreviews.has(stageKey)) {
      return;
    }
    const meta = STAGE_PREVIEW_META[stageKey] || { label: stageKey, alt: stageKey };
    const line = document.createElement("div");
    line.className = "eld-terminal-line stage-preview-line";

    const shell = document.createElement("div");
    shell.className = "eld-terminal-stage-preview";

    const labelEl = document.createElement("div");
    labelEl.className = "eld-stage-preview-label";
    labelEl.textContent = meta.label;

    const frame = document.createElement("div");
    frame.className = "eld-stage-preview-frame";
    frame.innerHTML = `
      <div class="eld-stage-preview-spinner" aria-hidden="true"></div>
      <span class="eld-stage-preview-waiting">awaiting render...</span>
    `;

    shell.appendChild(labelEl);
    shell.appendChild(frame);
    line.appendChild(shell);
    terminalOutput.appendChild(line);
    terminalOutput.parentElement.scrollTop = terminalOutput.parentElement.scrollHeight;
    pendingStagePreviews.set(stageKey, { frame, shell, meta });
  }

  function renderStagePreviewImage(stageKey, dataUrl) {
    const preview = pendingStagePreviews.get(stageKey);
    if (!preview) {
      return;
    }
    const { frame, shell, meta } = preview;
    frame.innerHTML = "";
    if (dataUrl) {
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = meta?.alt || `${stageKey} preview`;
      frame.appendChild(img);
      shell.classList.add("ready");
    } else {
      const fallback = document.createElement("span");
      fallback.className = "eld-stage-preview-missing";
      fallback.textContent = "preview unavailable";
      frame.appendChild(fallback);
      shell.classList.add("is-missing");
    }
  }

  async function revealStagePreviews(previewMap, stageOrder) {
    if (!pendingStagePreviews.size) {
      return;
    }
    if (!previewMap) {
      markStagePreviewsUnavailable();
      return;
    }
    const order = stageOrder && stageOrder.length ? stageOrder : Array.from(pendingStagePreviews.keys());
    for (const stage of order) {
      if (!pendingStagePreviews.has(stage)) {
        continue;
      }
      await sleep(160);
      renderStagePreviewImage(stage, previewMap[stage]);
    }
  }

  function markStagePreviewsUnavailable(message = "preview unavailable") {
    pendingStagePreviews.forEach(({ frame, shell }) => {
      if (frame.querySelector("img") || frame.querySelector(".eld-stage-preview-missing")) {
        return;
      }
      frame.innerHTML = "";
      const fallback = document.createElement("span");
      fallback.className = "eld-stage-preview-missing";
      fallback.textContent = message;
      frame.appendChild(fallback);
      shell.classList.add("is-missing");
    });
  }

  function addTerminalLine(text, type = "") {
    const line = document.createElement("div");
    line.className = `eld-terminal-line ${type}`;
    line.textContent = text;
    terminalOutput.appendChild(line);

    // Auto-scroll to bottom
    terminalOutput.parentElement.scrollTop = terminalOutput.parentElement.scrollHeight;
  }

  function createPromptProgressTracker(initialStatus = "Waiting for processing...") {
    if (!terminalOutput) {
      return null;
    }
    const shell = document.createElement("div");
    shell.className = "eld-progress";
    shell.innerHTML = `
      <div class="eld-progress__bar">
        <div class="eld-progress__fill" style="width: 0%;"></div>
      </div>
      <div class="eld-progress__meta">
        <span class="eld-progress__label">${initialStatus}</span>
        <span class="eld-progress__eta">ETA --:--</span>
      </div>
    `;
    terminalOutput.appendChild(shell);
    terminalOutput.parentElement.scrollTop = terminalOutput.parentElement.scrollHeight;

    const fillEl = shell.querySelector(".eld-progress__fill");
    const labelEl = shell.querySelector(".eld-progress__label");
    const etaEl = shell.querySelector(".eld-progress__eta");

    const tracker = {
      update(progressRatio = 0, etaSeconds) {
        if (fillEl) {
          const pct = Math.max(0, Math.min(progressRatio, 1));
          fillEl.style.width = `${(pct * 100).toFixed(1)}%`;
        }
        if (etaEl && etaSeconds !== undefined) {
          etaEl.textContent = formatProgressEta(etaSeconds);
        }
      },
      setStatus(text) {
        if (labelEl && text) {
          labelEl.textContent = text;
        }
      },
      complete(message = "Processing complete") {
        tracker.setStatus(message);
        tracker.update(1, 0);
        if (etaEl) {
          etaEl.textContent = "Done";
        }
        shell.classList.add("is-complete");
        setTimeout(() => tracker.remove(), 1200);
      },
      fail(message = "Processing failed") {
        tracker.setStatus(message);
        shell.classList.add("is-error");
        if (etaEl) {
          etaEl.textContent = "Error";
        }
        setTimeout(() => tracker.remove(), 1600);
      },
      remove() {
        if (shell?.parentElement) {
          shell.remove();
        }
      },
    };

    return tracker;
  }

  function formatProgressEta(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return "ETA --:--";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.max(0, Math.round(seconds % 60));
    return `ETA ${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function showModePrompt() {
    const block = document.createElement("div");
    block.className = "eld-terminal-line info";
    block.innerHTML = `<span style="color: #00ffe1;">$ mode</span>`;
    const buttonRow = document.createElement("div");
    buttonRow.className = "eld-terminal-mode-buttons";

    [
      {
        id: "upload",
        label: "VAE Upload",
        note: "Enhance an existing photo",
        handler: () => showFilePrompt(),
      },
      {
        id: "prompt",
        label: "IMGEN",
        note: "Generate from text prompt",
        handler: () => showPromptInput(),
      },
    ].forEach((mode) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = mode.label;
      btn.addEventListener("click", () => {
        currentMode = mode.id;
        const note = mode.note ? ` (${mode.note})` : "";
        addTerminalLine(`$ Mode selected: ${mode.label}${note}`, "info");
        block.remove();
        mode.handler();
      });
      buttonRow.appendChild(btn);
    });

    block.appendChild(buttonRow);
    terminalOutput.appendChild(block);
  }

  function showPromptInput(prefill = "") {
    const promptDiv = document.createElement("div");
    promptDiv.className = "eld-terminal-line info terminal-prompt-entry";
    promptDiv.innerHTML = `<span style="color: #00ffe1;">$ prompt</span>`;

    const textarea = document.createElement("textarea");
    textarea.className = "eld-terminal-textarea";
    textarea.placeholder = "Describe the scene you want...";
    textarea.rows = 3;
    textarea.value = prefill;

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "eld-terminal-submit";
    submitBtn.innerHTML = `<span class="eld-terminal-submit-label">$ generate</span><span class="eld-terminal-submit-cursor">_</span>`;
    submitBtn.setAttribute("aria-label", "Generate image");

    promptDiv.appendChild(textarea);
    promptDiv.appendChild(submitBtn);
    terminalOutput.appendChild(promptDiv);
    textarea.focus();

    const submit = () => {
      handlePromptSubmit(textarea.value, promptDiv);
    };

    submitBtn.addEventListener("click", submit);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    });
  }

  async function handlePromptSubmit(rawPrompt, promptDiv) {
    const promptText = (rawPrompt || "").trim();
    if (!promptText) {
      addTerminalLine("? Error: Prompt is required", "error");
      return;
    }
    if (isProcessing) return;
    isProcessing = true;
    clearStageDownloads();
    if (downloadPanel) {
      downloadPanel.setAttribute("hidden", "");
    }
    if (promptDiv) {
      promptDiv.remove();
    }

    addTerminalLine("");
    addTerminalLine(`$ prompt --len ${promptText.length}`, "info");
    const seed = Math.floor(Math.random() * 1_000_000);
    await simulatePromptProgress(seed);
    addTerminalLine("$ Uploading to server...", "info");

    let progressTracker = null;
    try {
      // Start the job
      const response = await fetch(PROMPT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, seed }),
      });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const startData = await response.json();
      if (startData.error) {
        throw new Error(startData.error);
      }
      const jobId = startData.job_id;

      addTerminalLine("✔ Job submitted to queue", "success");
      addTerminalLine("$ Waiting for processing...", "info");

      // Poll for completion
      const pollDelayMs = 2000;
      let attempts = 0;
      const maxAttempts = 200; // 200 * 2 seconds = 400 seconds max
      const maxDurationMs = maxAttempts * pollDelayMs;
      const pollStart = Date.now();
      progressTracker = createPromptProgressTracker("Waiting for processing...");
      progressTracker?.update(0, Math.round(maxDurationMs / 1000));

      while (attempts < maxAttempts) {
        await sleep(pollDelayMs); // Poll every 2 seconds
        const statusResponse = await fetch(`/api/imgen/status/${jobId}`);
        const statusData = await statusResponse.json();
        const elapsedMs = Date.now() - pollStart;
        const fallbackEtaSeconds = Math.max(0, Math.round((maxDurationMs - elapsedMs) / 1000));
        const etaFromStatus = Number(statusData?.eta_seconds);
        const etaSeconds = Number.isFinite(etaFromStatus)
          ? etaFromStatus
          : fallbackEtaSeconds;
        const progressRatio = Math.min(elapsedMs / maxDurationMs, 0.98);
        progressTracker?.update(progressRatio, etaSeconds);

        const queuePosition = Number(statusData?.queue_position);
        if (Number.isFinite(queuePosition) && queuePosition >= 0) {
          progressTracker?.setStatus(`Queue position ${queuePosition}`);
        } else if (statusData?.status === "running") {
          progressTracker?.setStatus("Rendering on server...");
        } else if (statusData?.status === "queued") {
          progressTracker?.setStatus("Waiting in queue...");
        }

        if (statusData.status === "completed") {
          progressTracker?.complete("Processing complete");
          progressTracker = null;
          addTerminalLine("✔ Server processing complete", "success");
          addTerminalLine("");
          await sleep(500);
          addTerminalLine("$ Displaying results...", "info");
          await sleep(600);
          displayResults(null, statusData.result);
          return;
        } else if (statusData.status === "failed") {
          progressTracker?.fail("Processing failed");
          progressTracker = null;
          throw new Error(statusData.error || "Processing failed");
        }
        // Still pending, continue polling
        attempts++;
      }
      progressTracker?.fail("Processing timed out");
      progressTracker = null;
      throw new Error("Processing timed out");
    } catch (error) {
      console.error("Prompt error:", error);
      addTerminalLine("");
      addTerminalLine(`✖ Error: ${error.message}`, "error");
      addTerminalLine("");
      markStagePreviewsUnavailable("prompt failed");
      addTerminalLine("$ Restoring prompt input...", "warning");
      await sleep(600);
      showPromptInput(promptText);
      if (progressTracker) {
        progressTracker.fail("Processing failed");
        progressTracker = null;
      }
    } finally {
      if (progressTracker) {
        progressTracker.remove();
        progressTracker = null;
      }
      isProcessing = false;
    }
  }

  async function simulatePromptProgress(seed) {
    await sleep(150);
    addTerminalLine(`[seed] ${seed}`, "info");
    await sleep(250);
    addTerminalLine("[1/4] Tokenizing prompt", "warning");
    await sleep(350);
    addTerminalLine("  ↳ Applying tiny-BERT encoder", "info");
    await sleep(300);
    addTerminalLine("[2/4] Sampling latent noise", "warning");
    await sleep(400);
    addTerminalLine("  ↳ Drawing 128×128×3 gaussian field", "info");
    await sleep(300);
    addTerminalLine("[3/4] Guidance fusion", "warning");
    await sleep(450);
    addTerminalLine("  ↳ CFG passes over unconditional/text embeddings", "info");
    await sleep(350);
    addTerminalLine("[4/4] Diffusion steps", "warning");
    await sleep(500);
    addTerminalLine("  ↳ Progressing through scheduler timesteps", "info");
    await sleep(400);
    addTerminalLine("  ↳ Collapsing latent to RGB image", "info");
    await sleep(350);
    addTerminalLine("✔ Prompt synthesis complete", "success");
    addTerminalLine("");
  }

  function setResultVisibility(visibleTypes) {
    const allowed = new Set(visibleTypes);
    document.querySelectorAll(".eld-result-item").forEach((item) => {
      const type = item.getAttribute("data-type");
      if (!type) return;
      if (allowed.has(type)) {
        item.removeAttribute("hidden");
      } else {
        item.setAttribute("hidden", "");
      }
    });
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
    queueStagePreview("input32");

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
    queueStagePreview("vae");

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
    queueStagePreview("refined");

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
    queueStagePreview("upsampled");

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
    // Don't queue the HD preview during processing - will show all steps after completion

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
      addTerminalLine("─".repeat(60), "info");
      addTerminalLine("$ Rendering pipeline outputs:", "info");
      addTerminalLine("");

      // Queue all stages including HD
      UPLOAD_STAGE_ORDER.forEach(stage => {
        queueStagePreview(stage);
      });

      await revealStagePreviews(data.previews, UPLOAD_STAGE_ORDER);
      await sleep(400);
      addTerminalLine("");
      addTerminalLine("─".repeat(60), "info");
      addTerminalLine("✔ Pipeline complete!", "success");
      await sleep(200);
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
      markStagePreviewsUnavailable("offline preview only");

      // Fallback: show input image only
      displayResults(file, null);
    }

    isProcessing = false;
  }

  function displayResults(file, data) {
    const mode = data?.mode || (file ? "upload" : "prompt");
    const hasInputFile = !!file;
    const stageOrder = mode === "prompt" ? [...PROMPT_STAGE_ORDER] : ["vae", "refined", "upsampled", "hd"];
    const previewMap =
      data?.previews ||
      (data?.preview ? { hd: data.preview } : null);
    if (mode === "prompt") {
      setResultVisibility(["hd"]);
    } else {
      setResultVisibility(["input", "vae", "refined", "upsampled", "hd"]);
    }

    // Surface the gallery but keep the terminal in place so previews remain visible
    if (resultsGrid) {
      resultsGrid.removeAttribute("hidden");
    }
    if (downloadPanel) {
      downloadPanel.removeAttribute("hidden");
    }
    selectedFile = null;
    isProcessing = false;

    // Display input image (original, not resized)
    if (hasInputFile) {
      const inputImg = document.getElementById("result-input");
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        inputImg.src = dataUrl;
        const downloadInput = document.getElementById("download-input");
        const filename = `input_${file.name}`;
        downloadInput.href = dataUrl;
        downloadInput.download = filename;
        stageDownloads.input = { dataUrl, filename };
      };
      reader.readAsDataURL(file);
    }

    // Display server results if available
    if (previewMap) {
      stageOrder.forEach(stage => {
        const dataUrl = previewMap[stage];
        if (!dataUrl) {
          return;
        }
        const img = document.getElementById(`result-${stage}`);
        const downloadBtn = document.getElementById(`download-${stage}`);
        const filename = `${stage}_${Date.now()}.png`;
        if (img) {
          img.src = dataUrl;
        }
        if (downloadBtn) {
          downloadBtn.href = dataUrl;
          downloadBtn.download = filename;
        }
        stageDownloads[stage] = { dataUrl, filename };
      });
    } else if (data?.image_url) {
      const hdImg = document.getElementById("result-hd");
      const downloadBtn = document.getElementById("download-hd");
      const filename = data.filename || `hd_${Date.now()}.png`;
      if (hdImg) {
        hdImg.src = data.image_url;
      }
      if (downloadBtn) {
        downloadBtn.href = data.image_url;
        downloadBtn.removeAttribute("download");
      }
      stageDownloads.hd = { dataUrl: data.image_url, filename };
    } else {
      markStagePreviewsUnavailable("preview unavailable");
      if (hasInputFile) {
        // Fallback: duplicate input for all stages when working offline
        setTimeout(() => {
          const inputImg = document.getElementById("result-input");
          const inputSrc = inputImg?.src;
          stageOrder.forEach(stage => {
            const stageImg = document.getElementById(`result-${stage}`);
            const downloadBtn = document.getElementById(`download-${stage}`);
            const filename = `${stage}_${Date.now()}.png`;
            if (stageImg && inputSrc) {
              stageImg.src = inputSrc;
            }
            if (downloadBtn && inputSrc) {
              downloadBtn.href = inputSrc;
              downloadBtn.download = filename;
              stageDownloads[stage] = { dataUrl: inputSrc, filename };
            }
          });
        }, 500);
      }
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
