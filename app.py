from flask import Flask, request, jsonify, send_from_directory
import os
import requests
import time
import tempfile
import subprocess
import yt_dlp

app = Flask(__name__, static_folder='public')

SONIOX_API_KEY = os.environ.get('SONIOX_API_KEY')
SONIOX_API_URL = "https://api.soniox.com"


def get_session():
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {SONIOX_API_KEY}"
    return session


@app.route('/')
def index():
    return send_from_directory('public', 'index.html')


@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('public', filename)


@app.route('/api/transcribe', methods=['POST', 'OPTIONS'])
def transcribe():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response

    try:
        if not SONIOX_API_KEY:
            return jsonify({'error': 'SONIOX_API_KEY not configured'}), 500

        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        file_content = audio_file.read()
        original_filename = audio_file.filename or 'audio.mp3'

        file_size_mb = len(file_content) / (1024 * 1024)
        print(f"File: {original_filename} ({file_size_mb:.2f} MB)")

        result = transcribe_with_soniox(file_content, original_filename)

        if 'error' in result:
            return jsonify({'error': result['error']}), result.get('status_code', 500)

        response = jsonify(result)
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/transcribe-youtube', methods=['POST', 'OPTIONS'])
def transcribe_youtube():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response

    try:
        if not SONIOX_API_KEY:
            return jsonify({'error': 'SONIOX_API_KEY not configured'}), 500

        data = request.get_json()
        youtube_url = data.get('url', '').strip()

        if not youtube_url:
            return jsonify({'error': 'No YouTube URL provided'}), 400

        # Validate YouTube URL
        if not is_valid_youtube_url(youtube_url):
            return jsonify({'error': 'Invalid YouTube URL'}), 400

        print(f"YouTube URL: {youtube_url}")

        # Download audio from YouTube
        print("[1/5] Downloading audio from YouTube...")
        audio_result = download_youtube_audio(youtube_url)

        if 'error' in audio_result:
            return jsonify({'error': audio_result['error']}), 500

        audio_path = audio_result['path']
        video_title = audio_result.get('title', 'youtube_video')

        try:
            # Read the downloaded audio file
            with open(audio_path, 'rb') as f:
                file_content = f.read()

            file_size_mb = len(file_content) / (1024 * 1024)
            print(f"Downloaded: {video_title} ({file_size_mb:.2f} MB)")

            # Transcribe
            result = transcribe_with_soniox(file_content, f"{video_title}.mp3")

            if 'error' in result:
                return jsonify({'error': result['error']}), result.get('status_code', 500)

            result['video_title'] = video_title
            response = jsonify(result)
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response

        finally:
            # Clean up temp file
            if os.path.exists(audio_path):
                os.remove(audio_path)
                print("Cleaned up temp audio file")

    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def is_valid_youtube_url(url):
    """Check if URL is a valid YouTube URL"""
    youtube_patterns = [
        'youtube.com/watch',
        'youtu.be/',
        'youtube.com/shorts/',
        'youtube.com/embed/',
        'youtube.com/v/',
    ]
    return any(pattern in url for pattern in youtube_patterns)


def download_youtube_audio(url):
    """Download audio from YouTube video using yt-dlp"""
    try:

        # Create temp directory
        temp_dir = tempfile.mkdtemp()
        output_path = os.path.join(temp_dir, 'audio.mp3')

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(temp_dir, 'audio.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '128',
            }],
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_title = info.get('title', 'youtube_video')

        # Find the downloaded file
        for file in os.listdir(temp_dir):
            if file.endswith('.mp3'):
                return {
                    'path': os.path.join(temp_dir, file),
                    'title': video_title
                }

        return {'error': 'Failed to download audio'}

    except Exception as e:
        print(f"YouTube download error: {str(e)}")
        return {'error': f'Failed to download YouTube video: {str(e)}'}


def transcribe_with_soniox(file_content, filename):
    session = get_session()
    file_id = None
    transcription_id = None

    try:
        # Step 1: Upload file
        print("[2/5] Uploading to Soniox...")
        res = session.post(
            f"{SONIOX_API_URL}/v1/files",
            files={"file": (filename, file_content)},
            timeout=300
        )
        
        if res.status_code not in [200, 201]:
            return {'error': f'Upload failed: {res.text}', 'status_code': res.status_code}
        
        file_id = res.json()["id"]
        print(f"[2/5] ✓ File ID: {file_id}")

        # Step 2: Create transcription
        print("[3/5] Creating transcription...")
        config = {
            "model": "stt-async-v3",
            "file_id": file_id,
            "language_hints": ["en", "te", "hi", "es", "fr", "de"],
            "enable_speaker_diarization": True,
        }
        
        res = session.post(
            f"{SONIOX_API_URL}/v1/transcriptions",
            json=config,
            timeout=60
        )
        
        if res.status_code not in [200, 201]:
            return {'error': f'Failed to create: {res.text}', 'status_code': res.status_code}
        
        transcription_id = res.json()["id"]
        print(f"[3/5] ✓ Transcription ID: {transcription_id}")

        # Step 3: Wait for completion
        print("[4/5] Processing...")
        for attempt in range(300):  # 10 minutes max
            res = session.get(
                f"{SONIOX_API_URL}/v1/transcriptions/{transcription_id}",
                timeout=30
            )
            
            if res.status_code != 200:
                return {'error': 'Status check failed', 'status_code': res.status_code}
            
            data = res.json()
            status = data.get("status")
            
            if attempt % 10 == 0:
                print(f"  Status: {status}")
            
            if status == "completed":
                print("[4/5] ✓ Completed!")
                break
            elif status == "error":
                return {'error': data.get('error_message', 'Failed'), 'status_code': 500}
            
            time.sleep(2)
        else:
            return {'error': 'Timeout', 'status_code': 504}

        # Step 4: Get transcript
        print("[5/5] Getting transcript...")
        res = session.get(
            f"{SONIOX_API_URL}/v1/transcriptions/{transcription_id}/transcript",
            timeout=60
        )
        
        if res.status_code != 200:
            return {'error': 'Failed to get transcript', 'status_code': res.status_code}
        
        transcript_data = res.json()
        text = render_tokens(transcript_data.get("tokens", []))
        
        print(f"[5/5] ✓ Done! {len(text)} chars")

        cleanup(session, transcription_id, file_id)

        return {'success': True, 'transcription': text}

    except Exception as e:
        cleanup(session, transcription_id, file_id)
        return {'error': str(e), 'status_code': 500}


def render_tokens(tokens):
    if not tokens:
        return ""
    
    text_parts = []
    current_speaker = None
    
    for token in tokens:
        text = token.get("text", "")
        speaker = token.get("speaker")
        
        if speaker is not None and speaker != current_speaker:
            if current_speaker is not None:
                text_parts.append("\n\n")
            current_speaker = speaker
            text_parts.append(f"[Speaker {speaker}]: ")
        
        text_parts.append(text)
    
    return "".join(text_parts).strip()


def cleanup(session, transcription_id, file_id):
    try:
        if transcription_id:
            session.delete(f"{SONIOX_API_URL}/v1/transcriptions/{transcription_id}")
    except:
        pass
    try:
        if file_id:
            session.delete(f"{SONIOX_API_URL}/v1/files/{file_id}")
    except:
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"\n{'='*50}")
    print(f"  Audio Transcription Server")
    print(f"  Port: {port}")
    print(f"  API Key: {'✓' if SONIOX_API_KEY else '✗'}")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=port, debug=False)