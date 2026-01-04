from flask import Flask, request, jsonify, send_from_directory
import os
import requests
import time

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


def transcribe_with_soniox(file_content, filename):
    session = get_session()
    file_id = None
    transcription_id = None

    try:
        # Step 1: Upload file
        print("[1/4] Uploading file...")
        res = session.post(
            f"{SONIOX_API_URL}/v1/files",
            files={"file": (filename, file_content)},
            timeout=300
        )
        
        if res.status_code not in [200, 201]:
            return {'error': f'Upload failed: {res.text}', 'status_code': res.status_code}
        
        file_id = res.json()["id"]
        print(f"[1/4] ✓ File ID: {file_id}")

        # Step 2: Create transcription
        print("[2/4] Creating transcription...")
        config = {
            "model": "stt-async-v3",
            "file_id": file_id,
            "language_hints": ["en", "te", "hi"],
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
        print(f"[2/4] ✓ Transcription ID: {transcription_id}")

        # Step 3: Wait for completion
        print("[3/4] Processing...")
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
                print("[3/4] ✓ Completed!")
                break
            elif status == "error":
                return {'error': data.get('error_message', 'Failed'), 'status_code': 500}
            
            time.sleep(2)
        else:
            return {'error': 'Timeout', 'status_code': 504}

        # Step 4: Get transcript
        print("[4/4] Getting transcript...")
        res = session.get(
            f"{SONIOX_API_URL}/v1/transcriptions/{transcription_id}/transcript",
            timeout=60
        )
        
        if res.status_code != 200:
            return {'error': 'Failed to get transcript', 'status_code': res.status_code}
        
        transcript_data = res.json()
        text = render_tokens(transcript_data.get("tokens", []))
        
        print(f"[4/4] ✓ Done! {len(text)} chars")

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