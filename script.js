document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('record-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const saveBtn = document.getElementById('save-btn');
    const resetBtn = document.getElementById('reset-btn'); // New button
    const timeDisplay = document.getElementById('time-display');
    const statusMessage = document.getElementById('status-message');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');

    let audioContext;
    let analyser;
    let microphone;
    let mediaRecorder;
    let chunks = [];
    let selectedMimeType;
    let selectedExtension;

    // Timer Variables
    let startTime;
    let timerInterval;
    let elapsedPausedTime = 0;
    let pauseStartTime;

    let isRecording = false;
    let isPaused = false;
    let animationId;

    const MAX_RECORDING_TIME_MS = 60 * 60 * 1000;

    function resizeCanvas() {
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = canvas.parentElement.offsetHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function getSupportedMimeType() {
        // Priority: AAC/MP4 -> WebM (Fallback)
        const types = [
            { mime: 'audio/mp4', ext: 'm4a' },
            { mime: 'audio/aac', ext: 'aac' },
            { mime: 'audio/webm;codecs=opus', ext: 'webm' },
            { mime: 'audio/webm', ext: 'webm' }
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type.mime)) {
                return type;
            }
        }
        return null;
    }

    async function setupAudio() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            analyser.fftSize = 256;

            const supportedType = getSupportedMimeType();
            if (!supportedType) {
                statusMessage.textContent = 'Error: No supported audio format found.';
                return false;
            }
            selectedMimeType = supportedType.mime;
            selectedExtension = supportedType.ext;

            console.log(`Using MIME type: ${selectedMimeType}`);

            mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });

            mediaRecorder.ondataavailable = (e) => {
                chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { 'type': selectedMimeType });
                chunks = [];
                const audioURL = window.URL.createObjectURL(blob);

                saveBtn.disabled = false;
                resetBtn.disabled = false; // Enable Reset

                saveBtn.onclick = () => {
                    const a = document.createElement('a');
                    a.href = audioURL;
                    a.download = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.${selectedExtension}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    statusMessage.textContent = 'Recording saved!';
                };

                statusMessage.textContent = 'Recording finished. Ready to save or reset.';
            };

            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            statusMessage.textContent = 'Error: Additional permissions needed or mic not found.';
            return false;
        }
    }

    function drawVisualizer() {
        if (!isRecording || isPaused) return;

        animationId = requestAnimationFrame(drawVisualizer);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#262626';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 1.8;

            const r = 29 + (200 * (i / bufferLength));
            const g = 233;
            const b = 182 + (70 * (i / bufferLength));

            canvasCtx.fillStyle = `rgb(${r},${g},${b})`;

            const y = (canvas.height - barHeight) / 2;
            canvasCtx.fillRect(x, y, barWidth, barHeight);

            x += barWidth + 1;
        }
    }

    function updateTimer() {
        if (isPaused) return;

        const now = Date.now();
        const totalElapsed = now - startTime - elapsedPausedTime;

        if (totalElapsed >= MAX_RECORDING_TIME_MS) {
            stopRecording();
            statusMessage.textContent = 'Recording auto-stopped (60m limit reached).';
            return;
        }

        const totalSeconds = Math.floor(totalElapsed / 1000);
        const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        timeDisplay.textContent = `${minutes}:${seconds}`;
    }

    function stopRecording() {
        if (!isRecording) return;

        mediaRecorder.stop();
        isRecording = false;
        isPaused = false;
        clearInterval(timerInterval);
        cancelAnimationFrame(animationId);

        recordBtn.classList.remove('recording');
        recordBtn.disabled = false;

        pauseBtn.disabled = true;
        pauseBtn.classList.remove('paused');
        // Reset Pause Button Icon to Default (Pause icon)
        pauseBtn.querySelector('.icon-pause').style.display = 'block';
        pauseBtn.querySelector('.icon-play').style.display = 'none';
        pauseBtn.querySelector('span').textContent = "Pause";

        stopBtn.disabled = true;

        // Don't clear viz here entirely? Or leave it static?
        // Usually better to clear or leave last frame. Let's clear for clean look.
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function resetApp() {
        // Reset Logic
        chunks = [];
        elapsedPausedTime = 0;
        timeDisplay.textContent = "00:00";
        statusMessage.textContent = "Ready to record";

        saveBtn.disabled = true;
        resetBtn.disabled = true;

        // Ensure everything is stopped if somehow running (defensive)
        if (isRecording) stopRecording();

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    recordBtn.addEventListener('click', async () => {
        if (isRecording) return;

        if (!audioContext) {
            const success = await setupAudio();
            if (!success) return;
        } else if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        mediaRecorder.start();
        isRecording = true;
        isPaused = false;
        startTime = Date.now();
        elapsedPausedTime = 0;
        timerInterval = setInterval(updateTimer, 1000);

        recordBtn.classList.add('recording');
        recordBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        saveBtn.disabled = true;
        resetBtn.disabled = true; // Disable Reset via recording
        statusMessage.textContent = 'Recording in progress...';

        drawVisualizer();
    });

    pauseBtn.addEventListener('click', () => {
        if (!isRecording) return;

        const pauseIcon = pauseBtn.querySelector('.icon-pause');
        const playIcon = pauseBtn.querySelector('.icon-play');
        const label = pauseBtn.querySelector('span');

        if (isPaused) {
            // RESUME
            mediaRecorder.resume();
            isPaused = false;

            const pauseDuration = Date.now() - pauseStartTime;
            elapsedPausedTime += pauseDuration;

            pauseBtn.classList.remove('paused');

            // Show Pause Icon, Hide Play Icon
            pauseIcon.style.display = 'block';
            playIcon.style.display = 'none';
            label.textContent = "Pause";

            statusMessage.textContent = 'Recording resumed...';
            drawVisualizer();

        } else {
            // PAUSE
            mediaRecorder.pause();
            isPaused = true;
            pauseStartTime = Date.now();

            pauseBtn.classList.add('paused');

            // Show Play Icon, Hide Pause Icon
            pauseIcon.style.display = 'none';
            playIcon.style.display = 'block';
            label.textContent = "Resume";

            statusMessage.textContent = 'Recording paused.';
            cancelAnimationFrame(animationId);
        }
    });

    stopBtn.addEventListener('click', stopRecording);

    resetBtn.addEventListener('click', resetApp);
});
