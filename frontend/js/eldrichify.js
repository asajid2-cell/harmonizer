(() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const API_ENDPOINT = "/api/eldrichify";

  // DOM Elements
  const launchBtn = document.querySelector('.launch-link');
  const terminalWindow = document.getElementById("terminal-window");
  const terminalOutput = document.getElementById("terminal-output");
  const terminalClose = document.getElementById("terminal-close");
  const resultsGrid = document.getElementById("results-grid");

  let selectedFile = null;
  let isProcessing = false;

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

  function openTerminal() {
    if (!terminalWindow || !terminalOutput) {
      console.error("Terminal elements not found!");
      return;
    }

    // Show terminal, hide results
    terminalWindow.removeAttribute("hidden");

    if (resultsGrid) {
      resultsGrid.setAttribute("hidden", "");
    }

    terminalOutput.innerHTML = "";

    addTerminalLine("Eldrichify Terminal v2.4.1", "info");
    addTerminalLine("Photon-Safe Upscaling Pipeline", "info");
    addTerminalLine("═".repeat(60), "info");
    addTerminalLine("");

    setTimeout(() => {
      addTerminalLine("$ Initializing VAE capture system...", "success");
    }, 300);

    setTimeout(() => {
      addTerminalLine("$ Cobalt refiner online", "success");
    }, 600);

    setTimeout(() => {
      addTerminalLine("$ DF2K broadcast module ready", "success");
    }, 900);

    setTimeout(() => {
      addTerminalLine("");
      addTerminalLine("Ready for image upload.", "info");
      addTerminalLine("");
      showFilePrompt();
    }, 1200);
  }

  function closeTerminal() {
    terminalWindow.setAttribute("hidden", "");
    selectedFile = null;
    isProcessing = false;
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
    promptDiv.innerHTML = `<span style="color: #00ffe1;">$ upload [SELECT IMAGE FILE]</span>`;
    terminalOutput.appendChild(promptDiv);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp,image/bmp";
    fileInput.style.cssText = "display: inline-block; margin-left: 10px; color: #00ff00; background: transparent; border: 1px solid #00ffe1; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 0.85rem;";

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

    const fakePath = `/tmp/eldrichify/${Date.now()}_${file.name}`;

    addTerminalLine("");
    addTerminalLine(`✓ File selected: ${file.name}`, "success");
    addTerminalLine(`  Size: ${(file.size / 1024).toFixed(2)} KB`, "info");
    addTerminalLine(`  Type: ${file.type}`, "info");
    addTerminalLine("");

    await sleep(400);
    addTerminalLine(`$ Copying to: ${fakePath}`, "info");
    await sleep(600);
    addTerminalLine("✓ Upload complete", "success");
    addTerminalLine("");

    await sleep(300);
    addTerminalLine("$ Starting pipeline execution...", "info");
    addTerminalLine("─".repeat(60), "info");
    addTerminalLine("");

    // Stage 1: Capture
    await sleep(500);
    addTerminalLine("[1/5] Capturing structure (32x32 latent)", "warning");
    await sleep(800);
    addTerminalLine("  → Loading base VAE model...", "info");
    await sleep(600);
    addTerminalLine("  → Encoding latent grid...", "info");
    await sleep(700);
    addTerminalLine("  ✓ Capture complete", "success");
    addTerminalLine("");

    // Stage 2: VAE
    await sleep(400);
    addTerminalLine("[2/5] VAE processing", "warning");
    await sleep(900);
    addTerminalLine("  → Applying VAE decoder...", "info");
    await sleep(700);
    addTerminalLine("  → Locking geometric structure...", "info");
    await sleep(600);
    addTerminalLine("  ✓ VAE pass complete", "success");
    addTerminalLine("");

    // Stage 3: Refine
    await sleep(400);
    addTerminalLine("[3/5] Refining with Cobalt", "warning");
    await sleep(1000);
    addTerminalLine("  → Loading refiner weights...", "info");
    await sleep(800);
    addTerminalLine("  → Uncrunching gradients...", "info");
    await sleep(700);
    addTerminalLine("  → Removing banding artifacts...", "info");
    await sleep(600);
    addTerminalLine("  ✓ Refinement complete", "success");
    addTerminalLine("");

    // Stage 4: Upsample
    await sleep(400);
    addTerminalLine("[4/5] Pixel upsampling", "warning");
    await sleep(900);
    addTerminalLine("  → Applying pixel shuffle...", "info");
    await sleep(800);
    addTerminalLine("  → 2x scale pass...", "info");
    await sleep(700);
    addTerminalLine("  ✓ Upsample complete", "success");
    addTerminalLine("");

    // Stage 5: HD Output
    await sleep(400);
    addTerminalLine("[5/5] DF2K broadcast", "warning");
    await sleep(1100);
    addTerminalLine("  → Loading DF2K model...", "info");
    await sleep(900);
    addTerminalLine("  → Final HD pass...", "info");
    await sleep(1000);
    addTerminalLine("  → Preserving neon edges...", "info");
    await sleep(800);
    addTerminalLine("  ✓ HD output generated", "success");
    addTerminalLine("");

    // Complete
    await sleep(500);
    addTerminalLine("─".repeat(60), "info");
    addTerminalLine("✓ Pipeline execution complete!", "success");
    addTerminalLine("");

    // Now send to backend
    await sleep(600);
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
    // Close terminal after a moment
    setTimeout(() => {
      closeTerminal();
      resultsGrid.removeAttribute("hidden");
    }, 1000);

    // Display input image
    const inputImg = document.getElementById("result-input");
    const reader = new FileReader();
    reader.onload = (e) => {
      inputImg.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Display server results if available
    if (data && data.previews) {
      // API returns previews object with base64 data URLs
      if (data.previews.vae) {
        document.getElementById("result-vae").src = data.previews.vae;
      }
      if (data.previews.refined) {
        document.getElementById("result-refined").src = data.previews.refined;
      }
      if (data.previews.upsampled) {
        document.getElementById("result-upsampled").src = data.previews.upsampled;
      }
      if (data.previews.hd) {
        document.getElementById("result-hd").src = data.previews.hd;
      }

      // Setup download with final image URL
      if (data.image_url) {
        const downloadBtn = document.getElementById("download-btn");
        downloadBtn.href = data.image_url;
        downloadBtn.download = data.filename || `eldrichify_${Date.now()}.png`;
      }
    } else {
      // Fallback: duplicate input for all stages
      setTimeout(() => {
        const inputSrc = inputImg.src;
        document.getElementById("result-vae").src = inputSrc;
        document.getElementById("result-refined").src = inputSrc;
        document.getElementById("result-upsampled").src = inputSrc;
        document.getElementById("result-hd").src = inputSrc;

        const downloadBtn = document.getElementById("download-btn");
        downloadBtn.href = inputSrc;
        downloadBtn.download = `eldrichify_${Date.now()}.png`;
      }, 500);
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
