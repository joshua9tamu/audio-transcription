document.addEventListener('DOMContentLoaded', function() {
    // Tab Elements
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Upload Elements
    const uploadArea = document.getElementById('uploadArea');
    const audioInput = document.getElementById('audioInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const removeFile = document.getElementById('removeFile');
    const audioPreview = document.getElementById('audioPreview');
    const transcribeBtn = document.getElementById('transcribeBtn');

    // YouTube Elements
    const youtubeUrl = document.getElementById('youtubeUrl');
    const clearUrl = document.getElementById('clearUrl');
    const videoPreview = document.getElementById('videoPreview');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const youtubeTranscribeBtn = document.getElementById('youtubeTranscribeBtn');

    // Common Elements
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultSection = document.getElementById('resultSection');
    const transcriptionText = document.getElementById('transcriptionText');
    const wordCount = document.getElementById('wordCount');
    const charCount = document.getElementById('charCount');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorSection = document.getElementById('errorSection');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');

    let selectedFile = null;
    let currentTab = 'upload';

    // --- Tab Switching ---
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            currentTab = tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tab}-tab`) {
                    content.classList.add('active');
                }
            });

            resetUI();
        });
    });

    // --- Utility Functions ---
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function resetUI() {
        resultSection.classList.remove('show');
        errorSection.classList.remove('show');
        progressSection.classList.remove('show');
        progressBar.style.width = '0%';
    }

    function updateStats(text) {
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        wordCount.textContent = words;
        charCount.textContent = text.length;
    }

    function showToast(message, isError = false) {
        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''} show`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- File Upload Logic ---
    uploadArea.addEventListener('click', () => audioInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    audioInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    function handleFileSelect(file) {
        if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|wav|m4a|flac|ogg)$/i)) {
            showToast('Please select a valid audio file.', true);
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            audioPreview.src = e.target.result;
        };
        reader.readAsDataURL(file);

        fileInfo.classList.add('show');
        uploadArea.style.display = 'none';
        transcribeBtn.disabled = false;
        resetUI();
    }

    removeFile.addEventListener('click', () => {
        selectedFile = null;
        audioInput.value = '';
        fileInfo.classList.remove('show');
        uploadArea.style.display = 'block';
        transcribeBtn.disabled = true;
        audioPreview.src = '';
    });

    // --- YouTube Logic ---
    youtubeUrl.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        clearUrl.style.display = url ? 'flex' : 'none';
        
        // Simple regex to check if it looks like a YouTube URL
        const isYouTube = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url);
        youtubeTranscribeBtn.disabled = !isYouTube;
        
        if (isYouTube) {
            const videoId = extractVideoId(url);
            if (videoId) {
                videoThumbnail.innerHTML = `<img src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="thumbnail">`;
                videoPreview.style.display = 'flex';
            }
        } else {
            videoPreview.style.display = 'none';
        }
    });

    clearUrl.addEventListener('click', () => {
        youtubeUrl.value = '';
        clearUrl.style.display = 'none';
        videoPreview.style.display = 'none';
        youtubeTranscribeBtn.disabled = true;
    });

    function extractVideoId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // --- Transcription Execution ---
    async function startTranscription() {
        resetUI();
        progressSection.classList.add('show');
        progressText.textContent = "Starting process...";
        
        const formData = new FormData();
        let endpoint = '/api/transcribe';
        let options = {};

        if (currentTab === 'upload') {
            formData.append('audio', selectedFile);
            options = { method: 'POST', body: formData };
            transcribeBtn.disabled = true;
        } else {
            endpoint = '/api/transcribe-youtube';
            options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: youtubeUrl.value.trim() })
            };
            youtubeTranscribeBtn.disabled = true;
        }

        // Fake progress increments to keep user engaged
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 5;
                progressBar.style.width = `${Math.min(progress, 90)}%`;
                
                if (progress < 30) progressText.textContent = "Uploading/Downloading...";
                else if (progress < 60) progressText.textContent = "Processing audio...";
                else progressText.textContent = "Transcribing with AI...";
            }
        }, 2000);

        try {
            const response = await fetch(endpoint, options);
            const data = await response.json();

            clearInterval(interval);

            if (data.success) {
                progressBar.style.width = '100%';
                progressText.textContent = "Complete!";
                
                setTimeout(() => {
                    progressSection.classList.remove('show');
                    resultSection.classList.add('show');
                    transcriptionText.value = data.transcription;
                    updateStats(data.transcription);
                }, 500);
            } else {
                throw new Error(data.error || 'Transcription failed');
            }
        } catch (err) {
            clearInterval(interval);
            progressSection.classList.remove('show');
            errorSection.classList.add('show');
            errorMessage.textContent = err.message;
        } finally {
            transcribeBtn.disabled = (selectedFile === null);
            youtubeTranscribeBtn.disabled = (youtubeUrl.value.trim() === '');
        }
    }

    transcribeBtn.addEventListener('click', startTranscription);
    youtubeTranscribeBtn.addEventListener('click', startTranscription);
    retryBtn.addEventListener('click', startTranscription);

    // --- Action Buttons ---
    copyBtn.addEventListener('click', () => {
        transcriptionText.select();
        document.execCommand('copy');
        showToast('Copied to clipboard!');
    });

    downloadBtn.addEventListener('click', () => {
        const text = transcriptionText.value;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcription_${Date.now()}.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
    });
});