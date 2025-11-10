(() => {
    const form = document.getElementById("eldrichify-form");
    if (!form) {
        return;
    }

    const fileInput = document.getElementById("eldrichify-input");
    const submitBtn = document.getElementById("eldrichify-submit");
    const statusNode = document.getElementById("eldrichify-status");
    const spinner = document.getElementById("eldrichify-spinner");
    const resultsSection = document.getElementById("eldrichify-results");
    const resultImage = document.getElementById("eldrichify-result-image");
    const downloadLink = document.getElementById("eldrichify-download");
    const stagesGrid = document.getElementById("eldrichify-stages");
    const metaNode = document.getElementById("eldrichify-meta");
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

    function setStatus(message, isError = false) {
        statusNode.textContent = message;
        statusNode.classList.toggle("error", Boolean(isError));
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        spinner.hidden = !isLoading;
    }

    function formatStageLabel(key) {
        const labels = {
            input32: "Input 32x32",
            vae: "VAE pass",
            refined: "Refined",
            upsampled: "Upsampled 64x64",
            hd: "HD Super-Res",
        };
        return labels[key] || key;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        const file = fileInput.files[0];
        if (!file) {
            setStatus("Please choose an image first.", true);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setStatus("Image is too large. Keep it under 10 MB.", true);
            return;
        }

        const formData = new FormData();
        formData.append("image", file, file.name);
        setLoading(true);
        setStatus("Summoning latent spirits...");

        try {
            const response = await fetch("/api/eldrichify", {
                method: "POST",
                body: formData,
            });
            const contentType = response.headers.get("content-type") || "";
            let payload;

            if (contentType.includes("application/json")) {
                payload = await response.json();
            } else {
                const text = await response.text();
                throw new Error(text || "Server returned an unexpected response.");
            }

            if (!response.ok) {
                throw new Error(payload.error || "Server error");
            }

            renderResult(payload);
            setStatus("Neon alchemy complete.");
        } catch (error) {
            console.error("[eldrichify] upload failed", error);
            setStatus(error.message || "Something went wrong.", true);
        } finally {
            setLoading(false);
        }
    }

    function renderResult(payload) {
        if (!payload || !payload.image_url) {
            return;
        }
        const { image_url: imageUrl, filename, original_size: originalSize, previews } = payload;
        const cacheBustingUrl = `${imageUrl}?t=${Date.now()}`;
        resultImage.src = cacheBustingUrl;
        resultImage.alt = `Eldrichified result ${filename}`;
        downloadLink.href = cacheBustingUrl;
        downloadLink.download = filename || "eldrichified.png";
        metaNode.textContent = originalSize
            ? `Original: ${originalSize.width}x${originalSize.height}`
            : "";

        stagesGrid.innerHTML = "";
        if (previews) {
            Object.entries(previews).forEach(([stage, dataUrl]) => {
                const card = document.createElement("article");
                card.className = "eldrichify-stage-card";
                const label = document.createElement("div");
                label.textContent = formatStageLabel(stage);
                const img = document.createElement("img");
                img.src = dataUrl;
                img.alt = `${stage} preview`;
                card.append(label, img);
                stagesGrid.appendChild(card);
            });
        }

        resultsSection.hidden = false;
    }

    form.addEventListener("submit", handleSubmit);
})();
