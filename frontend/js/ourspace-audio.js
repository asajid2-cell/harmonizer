// OurSpace Audio - Music Player

(function() {
    'use strict';

    let audioPlayer = null;
    let visualizerInterval = null;

    window.addEventListener('DOMContentLoaded', function() {
        initAudio();
    });

    function initAudio() {
        console.log("[Audio] Initializing music player...");

        audioPlayer = document.getElementById('audio-player');

        // Setup controls
        setupPlayerControls();

        // Setup upload
        setupAudioUpload();

        // Load saved audio
        loadSavedAudio();

        // Autoplay if enabled
        checkAutoplay();

        console.log("[Audio] Initialization complete");
    }

    // Player Controls
    function setupPlayerControls() {
        const playBtn = document.getElementById('play-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const stopBtn = document.getElementById('stop-btn');
        const volumeSlider = document.getElementById('volume-slider');
        const volumeDisplay = document.getElementById('volume-display');

        // Play button
        if (playBtn && audioPlayer) {
            playBtn.addEventListener('click', function() {
                audioPlayer.play()
                    .then(() => {
                        console.log("[Audio] Playing");
                        startVisualizer();
                    })
                    .catch(err => {
                        console.error("[Audio] Play error:", err);
                    });
            });
        }

        // Pause button
        if (pauseBtn && audioPlayer) {
            pauseBtn.addEventListener('click', function() {
                audioPlayer.pause();
                console.log("[Audio] Paused");
                stopVisualizer();
            });
        }

        // Stop button
        if (stopBtn && audioPlayer) {
            stopBtn.addEventListener('click', function() {
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
                console.log("[Audio] Stopped");
                stopVisualizer();
            });
        }

        // Volume slider
        if (volumeSlider && audioPlayer) {
            volumeSlider.value = window.OurSpace.profile.widgets.music.volume;
            audioPlayer.volume = window.OurSpace.profile.widgets.music.volume / 100;
            if (volumeDisplay) {
                volumeDisplay.textContent = window.OurSpace.profile.widgets.music.volume + '%';
            }

            volumeSlider.addEventListener('input', function() {
                const volume = parseInt(this.value);
                audioPlayer.volume = volume / 100;
                if (volumeDisplay) {
                    volumeDisplay.textContent = volume + '%';
                }
            });

            volumeSlider.addEventListener('change', function() {
                window.OurSpace.profile.widgets.music.volume = parseInt(this.value);
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Audio ended event
        if (audioPlayer) {
            audioPlayer.addEventListener('ended', function() {
                stopVisualizer();
            });
        }
    }

    // Audio Upload
    function setupAudioUpload() {
        const audioUpload = document.getElementById('audio-upload');
        const autoplayCheckbox = document.getElementById('autoplay-checkbox');
        const removeAudioBtn = document.getElementById('remove-audio-btn');

        if (audioUpload) {
            audioUpload.addEventListener('change', async function() {
                const file = this.files[0];
                if (file && file.type.startsWith('audio/')) {
                    const title = prompt('Song title:', file.name.replace(/\.[^/.]+$/, ""));

                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'audio');

                        const response = await fetch('/api/ourspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            console.log('[Audio] Upload successful, URL:', data.url);
                            window.OurSpace.profile.widgets.music.audioData = data.url;
                            window.OurSpace.profile.widgets.music.title = title || file.name;
                            console.log('[Audio] Saving profile with audio data');
                            await // Auto-save removed - only save when user clicks Save Profile button
                            console.log('[Audio] Profile saved');

                            loadAudioIntoPlayer(data.url, title || file.name);

                            // Show remove button
                            if (removeAudioBtn) removeAudioBtn.style.display = 'inline-block';
                        } else {
                            console.error('[Audio] Failed to upload audio');
                            alert('Failed to upload audio file');
                        }
                    } catch (e) {
                        console.error('[Audio] Error uploading audio:', e);
                        alert('Error uploading audio file');
                    }
                }

                // Reset input
                this.value = '';
            });
        }

        // Remove audio button
        if (removeAudioBtn) {
            removeAudioBtn.addEventListener('click', function() {
                if (confirm('Remove uploaded song?')) {
                    window.OurSpace.profile.widgets.music.audioData = '';
                    window.OurSpace.profile.widgets.music.title = 'No track loaded';
                    // Auto-save removed - only save when user clicks Save Profile button

                    // Clear player
                    if (audioPlayer) {
                        audioPlayer.pause();
                        audioPlayer.src = '';
                    }

                    const trackTitle = document.getElementById('track-title');
                    if (trackTitle) {
                        trackTitle.textContent = 'No track loaded';
                    }

                    stopVisualizer();
                    this.style.display = 'none';
                }
            });

            // Show remove button if audio exists
            if (window.OurSpace.profile.widgets.music.audioData) {
                removeAudioBtn.style.display = 'inline-block';
            }
        }

        // Autoplay checkbox
        if (autoplayCheckbox) {
            autoplayCheckbox.checked = window.OurSpace.profile.widgets.music.autoplay;

            autoplayCheckbox.addEventListener('change', function() {
                window.OurSpace.profile.widgets.music.autoplay = this.checked;
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    // Load Saved Audio
    function loadSavedAudio() {
        const audioData = window.OurSpace.profile.widgets.music.audioData;
        const title = window.OurSpace.profile.widgets.music.title;

        if (audioData) {
            loadAudioIntoPlayer(audioData, title);
        }
    }

    // Load Audio into Player
    function loadAudioIntoPlayer(audioData, title) {
        if (!audioPlayer) return;

        audioPlayer.src = audioData;
        audioPlayer.load();

        const trackTitle = document.getElementById('track-title');
        if (trackTitle) {
            trackTitle.textContent = title || 'Unknown Track';
        }

        console.log("[Audio] Loaded:", title);
    }

    // Check Autoplay
    function checkAutoplay() {
        const autoplay = window.OurSpace.profile.widgets.music.autoplay;
        const audioData = window.OurSpace.profile.widgets.music.audioData;

        if (autoplay && audioData && audioPlayer) {
            // Delay autoplay slightly to ensure page is fully loaded
            setTimeout(function() {
                audioPlayer.play()
                    .then(() => {
                        console.log("[Audio] Autoplaying");
                        startVisualizer();
                    })
                    .catch(err => {
                        console.log("[Audio] Autoplay blocked by browser:", err);
                        // Browsers often block autoplay, this is expected
                    });
            }, 500);
        }
    }

    // Visualizer
    function startVisualizer() {
        if (visualizerInterval) return;

        const bars = document.querySelectorAll('#audio-visualizer .bar');

        visualizerInterval = setInterval(function() {
            bars.forEach(bar => {
                const height = Math.random() * 50 + 10;
                bar.style.height = height + 'px';
            });
        }, 100);
    }

    function stopVisualizer() {
        if (visualizerInterval) {
            clearInterval(visualizerInterval);
            visualizerInterval = null;
        }

        const bars = document.querySelectorAll('#audio-visualizer .bar');
        bars.forEach(bar => {
            bar.style.height = '10px';
        });
    }

    // Export public API
    window.OurSpaceAudio = {
        reloadAudio: function() {
            console.log('[Audio] Reloading audio from profile');
            loadSavedAudio();

            // Update remove button visibility
            const removeAudioBtn = document.getElementById('remove-audio-btn');
            if (removeAudioBtn && window.OurSpace.profile.widgets.music.audioData) {
                removeAudioBtn.style.display = 'inline-block';
            } else if (removeAudioBtn) {
                removeAudioBtn.style.display = 'none';
            }

            // Restore autoplay checkbox state
            const autoplayCheckbox = document.getElementById('autoplay-checkbox');
            if (autoplayCheckbox) {
                autoplayCheckbox.checked = window.OurSpace.profile.widgets.music.autoplay;
                console.log('[Audio] Autoplay setting restored:', window.OurSpace.profile.widgets.music.autoplay);
            }

            // Check and enforce autoplay
            checkAutoplay();
        }
    };

})();





