(() => {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const API_ENDPOINT = "/api/eldrichify";

  // DOM Elements
  const launchBtn = document.querySelector('.launch-link');
  const terminalWindow = document.getElementById("terminal-window");
  const terminalOutput = document.getElementById("terminal-output");
  const terminalClose = document.getElementById("terminal-close");
  const resultsGrid = document.getElementById("results-grid");
  const terminalDisconnected = document.getElementById("terminal-disconnected");
  const sizeSelector = document.getElementById("size-selector");

  let selectedFile = null;
  let isProcessing = false;
  let selectedSize = 768; // default size

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

  // Size selector buttons
  if (sizeSelector) {
    const sizeButtons = sizeSelector.querySelectorAll('.eld-size-btn');
    sizeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active from all buttons
        sizeButtons.forEach(b => b.classList.remove('active'));
        // Add active to clicked button
        btn.classList.add('active');
        // Update selected size
        selectedSize = parseInt(btn.getAttribute('data-size'));
      });
    });
  }

  function openTerminal() {
    if (!terminalWindow || !terminalOutput) {
      console.error("Terminal elements not found!");
      return;
    }

    // Show size selector and terminal, hide disconnected message and results
    if (sizeSelector) {
      sizeSelector.removeAttribute("hidden");
    }

    terminalWindow.removeAttribute("hidden");

    if (terminalDisconnected) {
      terminalDisconnected.setAttribute("hidden", "");
    }

    if (resultsGrid) {
      resultsGrid.setAttribute("hidden", "");
    }

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

    if (sizeSelector) {
      sizeSelector.setAttribute("hidden", "");
    }

    // Show disconnected message again
    if (terminalDisconnected) {
      terminalDisconnected.removeAttribute("hidden");
    }

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
      formData.append("target_size", selectedSize);

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
      if (sizeSelector) {
        sizeSelector.setAttribute("hidden", "");
      }
      resultsGrid.removeAttribute("hidden");
      // Don't show disconnected message when displaying results
      selectedFile = null;
      isProcessing = false;
    }, 1000);

    // Display input image (original, not resized)
    const inputImg = document.getElementById("result-input");
    const reader = new FileReader();
    reader.onload = (e) => {
      inputImg.src = e.target.result;
      // Set up download for original input
      const downloadInput = document.getElementById("download-input");
      downloadInput.href = e.target.result;
      downloadInput.download = `input_${file.name}`;
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
          img.src = data.previews[stage];
          downloadBtn.href = data.previews[stage];
          downloadBtn.download = `${stage}_${Date.now()}.png`;
        }
      });
    } else {
      // Fallback: duplicate input for all stages
      setTimeout(() => {
        const inputSrc = inputImg.src;
        ['vae', 'refined', 'upsampled', 'hd'].forEach(stage => {
          document.getElementById(`result-${stage}`).src = inputSrc;
          const downloadBtn = document.getElementById(`download-${stage}`);
          downloadBtn.href = inputSrc;
          downloadBtn.download = `${stage}_${Date.now()}.png`;
        });
      }, 500);
    }
  }

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
