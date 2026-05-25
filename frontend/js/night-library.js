(() => {
  const DEFAULT_COVER = "./assets/night-library/open-book.png";
  const STORAGE_PREFIX = "night-library";

  const els = {
    audio: document.getElementById("audio"),
    playToggle: document.getElementById("play-toggle"),
    playGlyph: document.getElementById("play-glyph"),
    rewind: document.getElementById("rewind"),
    forward: document.getElementById("forward"),
    seek: document.getElementById("seek"),
    volume: document.getElementById("volume"),
    speedSelect: document.getElementById("speed-select"),
    sleepToggle: document.getElementById("sleep-toggle"),
    bookCover: document.getElementById("book-cover"),
    bookTitle: document.getElementById("book-title"),
    bookAuthor: document.getElementById("book-author"),
    chapterTitle: document.getElementById("chapter-title"),
    currentTime: document.getElementById("current-time"),
    duration: document.getElementById("duration"),
    folderList: document.getElementById("folder-list"),
    trackList: document.getElementById("track-list"),
    folderCountAll: document.getElementById("folder-count-all"),
    libraryCurrentTitle: document.getElementById("library-current-title"),
    libraryCurrentAuthor: document.getElementById("library-current-author"),
    bookmarkList: document.getElementById("bookmark-list"),
    addBookmark: document.getElementById("add-bookmark"),
    noteInput: document.getElementById("note-input"),
    addNote: document.getElementById("add-note"),
    noteList: document.getElementById("note-list"),
    clearBookmarks: document.getElementById("clear-bookmarks"),
    clearNotes: document.getElementById("clear-notes"),
    queueNext: document.getElementById("queue-next"),
  };

  let tracks = [];
  let currentTrack = null;
  let sleepTimer = null;
  let lastSave = 0;

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  };

  const cleanTitle = (value) => (value || "").replace(/\s*\[[^\]]+\]\s*/g, "").trim();
  const storageKey = (track, key) => `${STORAGE_PREFIX}:${track?.id || "current"}:${key}`;
  const collectionKey = (type) => `${STORAGE_PREFIX}:${currentTrack?.id || "current"}:${type}`;

  const loadCollection = (type) => {
    try {
      return JSON.parse(localStorage.getItem(collectionKey(type)) || "[]");
    } catch (_) {
      return [];
    }
  };

  const saveCollection = (type, items) => {
    localStorage.setItem(collectionKey(type), JSON.stringify(items));
  };

  const updateMediaSession = () => {
    if (!("mediaSession" in navigator) || !currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || currentTrack.book || "Night Library",
      artist: currentTrack.author || "Audiobook",
      album: currentTrack.book || currentTrack.title || "Night Library",
      artwork: [{ src: currentTrack.coverUrl || DEFAULT_COVER, sizes: "512x512", type: "image/png" }],
    });
    try {
      navigator.mediaSession.setPositionState({
        duration: Number.isFinite(els.audio.duration) ? els.audio.duration : 0,
        playbackRate: els.audio.playbackRate,
        position: Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0,
      });
    } catch (_) {}
  };

  const setupMediaSessionActions = () => {
    if (!("mediaSession" in navigator)) return;
    const handlers = {
      play: () => els.audio.play(),
      pause: () => els.audio.pause(),
      seekbackward: (details) => {
        els.audio.currentTime = Math.max(0, els.audio.currentTime - (details.seekOffset || 30));
      },
      seekforward: (details) => {
        const target = els.audio.currentTime + (details.seekOffset || 30);
        els.audio.currentTime = Number.isFinite(els.audio.duration) ? Math.min(els.audio.duration, target) : target;
      },
      seekto: (details) => {
        if (typeof details.seekTime === "number") els.audio.currentTime = details.seekTime;
      },
      stop: () => els.audio.pause(),
    };
    Object.entries(handlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (_) {}
    });
  };

  const applySpeed = () => {
    const speed = Number(els.speedSelect.value) || 1;
    els.audio.playbackRate = speed;
    localStorage.setItem(`${STORAGE_PREFIX}:speed`, String(speed));
    updateMediaSession();
  };

  const applyVolume = () => {
    const saved = Number(localStorage.getItem(`${STORAGE_PREFIX}:volume`));
    if (Number.isFinite(saved)) els.volume.value = String(saved);
    els.audio.volume = Number(els.volume.value);
  };

  const selectTrack = (track) => {
    if (!track) {
      els.playToggle.disabled = true;
      els.bookTitle.textContent = "No audiobooks found";
      els.chapterTitle.textContent = "Add files to your audiobook folder";
      return;
    }

    currentTrack = track;
    const title = cleanTitle(track.book || track.title || "Audiobook");
    const chapter = cleanTitle(track.title || title);
    const author = track.author || "Audiobook";

    els.bookTitle.textContent = title;
    els.bookAuthor.textContent = author;
    els.chapterTitle.textContent = chapter;
    els.libraryCurrentTitle.textContent = title;
    els.libraryCurrentAuthor.textContent = author;
    els.bookCover.src = track.coverUrl || DEFAULT_COVER;
    els.bookCover.alt = `${title} cover`;
    els.audio.src = track.audioUrl;
    els.playToggle.disabled = false;

    const index = tracks.findIndex((item) => item.id === track.id);
    const next = tracks[index + 1] || tracks[0];
    els.queueNext.textContent = next && next.id !== track.id ? `Next: ${cleanTitle(next.title)}` : "Queue: one audiobook";

    document.querySelectorAll("[data-track-id]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.trackId === track.id);
    });

    renderBlurbs();
    updateMediaSession();
  };

  const renderLibrary = (books) => {
    const allButton = els.folderList.querySelector('[data-filter="all"]');
    els.folderList.innerHTML = "";
    els.folderList.appendChild(allButton);
    els.folderCountAll.textContent = String(tracks.length);

    books.forEach((book) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.book = book.title;
      button.innerHTML = `<span class="nl-folder-icon" aria-hidden="true"></span><span>${cleanTitle(book.title)}</span><small>${book.tracks.length}</small>`;
      button.addEventListener("click", () => {
        const first = tracks.find((track) => track.book === book.title);
        if (first) selectTrack(first);
      });
      els.folderList.appendChild(button);
    });

    els.trackList.innerHTML = "";
    tracks.forEach((track) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.trackId = track.id;
      button.innerHTML = `<span class="nl-folder-icon" aria-hidden="true"></span><span>${cleanTitle(track.title)}</span><small>${track.author || ""}</small>`;
      button.addEventListener("click", () => selectTrack(track));
      els.trackList.appendChild(button);
    });
  };

  const loadLibrary = async () => {
    try {
      const response = await fetch("/api/night-library/library");
      const library = await response.json();
      tracks = Array.isArray(library.tracks) ? library.tracks : [];
      renderLibrary(Array.isArray(library.books) ? library.books : []);
      selectTrack(tracks[0]);
    } catch (error) {
      console.warn("[NightLibrary] Library load failed", error);
      selectTrack(null);
    }
  };

  const savePosition = () => {
    if (!currentTrack || !Number.isFinite(els.audio.currentTime)) return;
    const now = Date.now();
    if (now - lastSave < 2500) return;
    lastSave = now;
    localStorage.setItem(storageKey(currentTrack, "position"), String(els.audio.currentTime));
  };

  const syncProgress = () => {
    if (Number.isFinite(els.audio.duration) && els.audio.duration > 0) {
      els.seek.value = Math.round((els.audio.currentTime / els.audio.duration) * 1000);
      els.currentTime.textContent = formatTime(els.audio.currentTime);
      els.duration.textContent = formatTime(els.audio.duration);
      updateMediaSession();
      savePosition();
    }
  };

  const renderBookmarks = () => {
    const bookmarks = loadCollection("bookmarks");
    els.bookmarkList.innerHTML = "";
    if (!bookmarks.length) {
      const empty = document.createElement("p");
      empty.className = "nl-empty";
      empty.textContent = "No bookmarks yet.";
      els.bookmarkList.appendChild(empty);
      return;
    }
    bookmarks.forEach((bookmark, index) => {
      const row = document.createElement("div");
      row.className = "nl-blurb-row";
      row.innerHTML = `<button type="button" class="nl-blurb-jump"><span class="nl-star ${index % 3 === 0 ? "pink" : index % 3 === 1 ? "yellow" : "cyan"}" aria-hidden="true">*</span><span><strong>${formatTime(bookmark.time)}</strong><small>${bookmark.label}</small></span></button><button type="button" class="nl-delete" aria-label="Delete bookmark">x</button>`;
      row.querySelector(".nl-blurb-jump").addEventListener("click", () => {
        els.audio.currentTime = bookmark.time;
      });
      row.querySelector(".nl-delete").addEventListener("click", () => {
        const next = loadCollection("bookmarks");
        next.splice(index, 1);
        saveCollection("bookmarks", next);
        renderBookmarks();
      });
      els.bookmarkList.appendChild(row);
    });
  };

  const renderNotes = () => {
    const notes = loadCollection("notes");
    els.noteList.innerHTML = "";
    notes.slice().reverse().forEach((note, reverseIndex) => {
      const index = notes.length - 1 - reverseIndex;
      const row = document.createElement("div");
      row.className = "nl-note-row";
      row.innerHTML = `<p>${note}</p><button type="button" class="nl-delete" aria-label="Delete note">x</button>`;
      row.querySelector(".nl-delete").addEventListener("click", () => {
        const next = loadCollection("notes");
        next.splice(index, 1);
        saveCollection("notes", next);
        renderNotes();
      });
      els.noteList.appendChild(row);
    });
  };

  const renderBlurbs = () => {
    renderBookmarks();
    renderNotes();
  };

  els.playToggle.addEventListener("click", () => {
    if (!els.audio.src) return;
    if (els.audio.paused) els.audio.play().catch((error) => console.warn("[NightLibrary] Play failed", error));
    else els.audio.pause();
  });

  els.audio.addEventListener("play", () => {
    els.playGlyph.textContent = "Pause";
    els.playToggle.setAttribute("aria-label", "Pause");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  });

  els.audio.addEventListener("pause", () => {
    els.playGlyph.textContent = "Play";
    els.playToggle.setAttribute("aria-label", "Play");
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    savePosition();
  });

  els.audio.addEventListener("loadedmetadata", () => {
    const saved = Number(localStorage.getItem(storageKey(currentTrack, "position")));
    if (Number.isFinite(saved) && saved > 0 && saved < els.audio.duration - 5) els.audio.currentTime = saved;
    syncProgress();
  });
  els.audio.addEventListener("durationchange", syncProgress);
  els.audio.addEventListener("timeupdate", syncProgress);
  window.addEventListener("beforeunload", savePosition);

  els.seek.addEventListener("input", () => {
    if (Number.isFinite(els.audio.duration) && els.audio.duration > 0) {
      els.audio.currentTime = (Number(els.seek.value) / 1000) * els.audio.duration;
    }
  });

  els.rewind.addEventListener("click", () => {
    if (els.audio.src) els.audio.currentTime = Math.max(0, els.audio.currentTime - 30);
  });

  els.forward.addEventListener("click", () => {
    if (els.audio.src) {
      const next = els.audio.currentTime + 30;
      els.audio.currentTime = Number.isFinite(els.audio.duration) ? Math.min(els.audio.duration, next) : next;
    }
  });

  els.volume.addEventListener("input", () => {
    els.audio.volume = Number(els.volume.value);
    localStorage.setItem(`${STORAGE_PREFIX}:volume`, els.volume.value);
  });

  els.speedSelect.addEventListener("change", applySpeed);

  els.sleepToggle.addEventListener("click", () => {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
      els.sleepToggle.textContent = "Sleep 45m";
      return;
    }
    sleepTimer = setTimeout(() => {
      els.audio.pause();
      sleepTimer = null;
      els.sleepToggle.textContent = "Sleep 45m";
    }, 45 * 60 * 1000);
    els.sleepToggle.textContent = "Sleep on";
  });

  els.addBookmark.addEventListener("click", () => {
    if (!currentTrack) return;
    const bookmarks = loadCollection("bookmarks");
    bookmarks.push({ time: els.audio.currentTime || 0, label: cleanTitle(currentTrack.title || currentTrack.book) });
    saveCollection("bookmarks", bookmarks);
    renderBookmarks();
  });

  els.addNote.addEventListener("click", () => {
    const value = els.noteInput.value.trim();
    if (!value) return;
    const notes = loadCollection("notes");
    notes.push(`${formatTime(els.audio.currentTime || 0)} - ${value}`);
    saveCollection("notes", notes);
    els.noteInput.value = "";
    renderNotes();
  });

  els.clearBookmarks.addEventListener("click", () => {
    saveCollection("bookmarks", []);
    renderBookmarks();
  });

  els.clearNotes.addEventListener("click", () => {
    saveCollection("notes", []);
    renderNotes();
  });

  setupMediaSessionActions();
  const savedSpeed = localStorage.getItem(`${STORAGE_PREFIX}:speed`);
  if (savedSpeed && [...els.speedSelect.options].some((option) => option.value === savedSpeed)) {
    els.speedSelect.value = savedSpeed;
  }
  applyVolume();
  applySpeed();
  loadLibrary();
})();
