document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const audioInput = document.getElementById('audioInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const removeFile = document.getElementById('removeFile');
    const audioPreview = document.getElementById('audioPreview');
    const transcribeBtn = document.getElementById('transcribeBtn');
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

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showToast(message, isError = false) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `toast ${isError ? 'error' : ''}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function handleFileSelect(file) {
        if (!file) return;

        const validExtensions = ['mp3', 'wav', 'm4a', 'flac', 'ogg'];
        const fileExtension = file.name.split('.').pop().toLowerCase();

        if (!validExtensions.includes(fileExtension)) {
            showToast('Invalid file type. Use MP3, WAV, M4A, FLAC, or OGG.', true);
            return;
        }

        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            showToast('File too large. Max 100MB.', true);
            return;
        }

        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);

        const audioURL = URL.createObjectURL(file);
        audioPreview.src = audioURL;

        uploadArea.style.display = 'none';
        fileInfo.classList.add('show');
        transcribeBtn.disabled = false;

        resultSection.classList.remove('show');
        errorSection.classList.remove('show');
    }

    uploadArea.addEventListener('click', () => audioInput.click());

    audioInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files[0]);
    });

    removeFile.addEventListener('click', () => {
        selectedFile = null;
        audioInput.value = '';
        audioPreview.src = '';
        uploadArea.style.display = 'block';
        fileInfo.classList.remove('show');
        transcribeBtn.disabled = true;
        resultSection.classList.remove('show');
        errorSection.classList.remove('show');
    });

    transcribeBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        progressSection.classList.add('show');
        resultSection.classList.remove('show');
        errorSection.classList.remove('show');
        transcribeBtn.disabled = true;
        transcribeBtn.innerHTML = '<span class="loading"></span> <span>Processing...</span>';

        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 5;
            if (progress > 90) progress = 90;
            progressBar.style.width = progress + '%';
        }, 1000);

        progressText.textContent = 'Uploading and processing...';

        try {
            const formData = new FormData();
            formData.append('audio', selectedFile);

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInterval);

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Transcription failed');
            }

            progressBar.style.width = '100%';
            progressText.textContent = 'Complete!';

            setTimeout(() => {
                progressSection.classList.remove('show');
                resultSection.classList.add('show');

                const text = data.transcription || '';
                transcriptionText.value = text;

                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                wordCount.textContent = words;
                charCount.textContent = text.length;

                showToast('Transcription completed!');
            }, 500);

        } catch (error) {
            clearInterval(progressInterval);
            console.error('Error:', error);
            progressSection.classList.remove('show');
            errorSection.classList.add('show');
            errorMessage.textContent = error.message || 'An error occurred';
        } finally {
            transcribeBtn.disabled = false;
            transcribeBtn.innerHTML = '<i class="fas fa-language"></i> <span>Transcribe Audio</span>';
            progressBar.style.width = '0%';
        }
    });

    copyBtn.addEventListener('click', async () => {
        const text = transcriptionText.value;
        if (!text) {
            showToast('No text to copy', true);
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
        } catch (err) {
            transcriptionText.select();
            document.execCommand('copy');
            showToast('Copied!');
        }
    });

    downloadBtn.addEventListener('click', () => {
        const text = transcriptionText.value;
        if (!text) {
            showToast('No text to download', true);
            return;
        }

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const name = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'transcription';
        a.href = url;
        a.download = `${name}_transcription.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Downloaded!');
        downloadBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        }, 2000);
    });

    retryBtn.addEventListener('click', () => {
        errorSection.classList.remove('show');
        if (selectedFile) {
            transcribeBtn.click();
        }
    });

    // Prevent default drag behavior
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });
});