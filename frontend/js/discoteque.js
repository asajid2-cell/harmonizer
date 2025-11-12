(() => {
  const API_ENDPOINT = "/api/talk-to-disco-teque";

  const launchBtn = document.getElementById("launch-chat-btn");
  const terminalWindow = document.getElementById("terminal-window");
  const terminalOutput = document.getElementById("terminal-output");
  const terminalBody = document.getElementById("terminal-body");
  const terminalClose = document.getElementById("terminal-close");
  const terminalDisconnected = document.getElementById("terminal-disconnected");
  const terminalHint = document.getElementById("terminal-hint");
  const consoleSection = document.getElementById("discoteque-console");

  const form = document.getElementById("terminal-input-form");
  const input = document.getElementById("terminal-input");
  const resetBtn = document.getElementById("terminal-reset");
  const suggestionButtons = document.querySelectorAll(".eld-suggestion-btn");

  let conversationHistory = [];
  let isSending = false;

  function setHint(text) {
    if (terminalHint) {
      terminalHint.textContent = text;
    }
  }

  function scrollConsoleIntoView() {
    if (consoleSection) {
      consoleSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function addLine(text, type = "") {
    if (!terminalOutput) return;
    const line = document.createElement("div");
    line.className = `eld-terminal-line ${type}`.trim();
    line.textContent = text;
    terminalOutput.appendChild(line);

    if (terminalBody) {
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  }

  function focusInput() {
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
    });
  }

  function resetConversation() {
    conversationHistory = [];
    if (form) {
      form.reset();
    }
  }

  function clearTerminal() {
    if (terminalOutput) {
      terminalOutput.innerHTML = "";
    }
  }

  function bootSequence() {
    resetConversation();
    clearTerminal();

    addLine("Disco-teque Signal Router v0.3", "info");
    addLine("Persona: neon concierge with a soft spot for analog delays.", "info");

    setTimeout(() => addLine("$ tuning uplink to Gemini free tier…", "warning"), 160);
    setTimeout(() => addLine("$ syncing vibe tables…", "warning"), 320);
    setTimeout(() => addLine("✔ link stabilized · ask anything about prompts, sets, metaphors.", "success"), 560);
    setTimeout(() => focusInput(), 600);
    setHint("Connected · Shift+Enter adds a line break");
  }

  function openTerminal() {
    if (!terminalWindow) {
      console.error("Terminal window not found.");
      return;
    }
    terminalWindow.removeAttribute("hidden");
    if (terminalDisconnected) {
      terminalDisconnected.setAttribute("hidden", "");
    }
    bootSequence();
    scrollConsoleIntoView();
  }

  function closeTerminal() {
    if (terminalWindow) {
      terminalWindow.setAttribute("hidden", "");
    }
    if (terminalDisconnected) {
      terminalDisconnected.removeAttribute("hidden");
    }
    resetConversation();
    clearTerminal();
    setHint("Shift+Enter adds a line break · Enter sends to Disco-teque.");
  }

  async function sendMessage(message) {
    if (!message || isSending) {
      return;
    }
    isSending = true;
    setHint("Routing through Gemini free tier…");
    addLine("$ contacting Disco-core via Gemini…", "warning");

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          message,
          history: conversationHistory,
        }),
      });

      const payload = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        const errorMsg = payload?.error || `LLM request failed (${response.status})`;
        throw new Error(errorMsg);
      }

      const reply = (payload && payload.reply ? String(payload.reply) : "").trim();

      conversationHistory.push({ role: "user", text: message });
      conversationHistory.push({ role: "model", text: reply || "[no reply]" });

      if (reply) {
        addLine(`disco-teque> ${reply}`, "success");
      } else {
        addLine("disco-teque> [Gemini returned an empty reply]", "warning");
      }

      if (payload?.usage) {
        const promptTokens = payload.usage.prompt_tokens ?? payload.usage.input_tokens;
        const completionTokens = payload.usage.completion_tokens ?? payload.usage.output_tokens;
        addLine(
          `usage> prompt: ${promptTokens ?? "?"} • completion: ${completionTokens ?? "?"}`,
          "info",
        );
      }
    } catch (err) {
      const messageText = err instanceof Error ? err.message : "Unexpected error contacting Gemini.";
      addLine(`error> ${messageText}`, "error");
    } finally {
      isSending = false;
      setHint("Connected · Shift+Enter adds a line break");
      focusInput();
    }
  }

  if (launchBtn) {
    launchBtn.addEventListener("click", (event) => {
      event.preventDefault();
      openTerminal();
    });
  }

  if (terminalClose) {
    terminalClose.addEventListener("click", () => {
      closeTerminal();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      bootSequence();
    });
  }

  if (form && input) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message || isSending) {
        return;
      }
      addLine(`you> ${message}`, "info");
      input.value = "";
      sendMessage(message);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
  }

  if (suggestionButtons.length) {
    suggestionButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!input) return;
        const prompt = btn.getAttribute("data-prompt") || "";
        if (prompt) {
          if (terminalWindow && terminalWindow.hasAttribute("hidden")) {
            openTerminal();
            setTimeout(() => {
              input.value = prompt;
              focusInput();
            }, 650);
          } else {
            input.value = prompt;
            focusInput();
          }
        }
      });
    });
  }
})();
