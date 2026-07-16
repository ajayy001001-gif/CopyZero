import { useEffect, useRef, useState } from 'react';

const LOCAL_MODEL_URL = '/models';
const CDN_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js/weights';

// Dev-only diagnostic page — not linked from any nav, not auth-gated.
// Verifies the face-api.js model loads and live detection actually runs,
// independent of the full proctoring hook/exam flow.
export default function FaceDetectionTest() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('Loading model...');
  const [result, setResult] = useState('—');
  const [source, setSource] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;
    let stream = null;

    async function run() {
      try {
        const faceapi = await import('face-api.js');

        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(LOCAL_MODEL_URL);
          if (cancelled) return;
          setSource('local files (/models)');
        } catch (localErr) {
          console.warn('[face-test] local model load failed, trying CDN fallback', localErr);
          await faceapi.nets.tinyFaceDetector.loadFromUri(CDN_FALLBACK_URL);
          if (cancelled) return;
          setSource('CDN fallback');
        }

        setStatus('Requesting camera...');
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setStatus('Running');

        intervalId = setInterval(async () => {
          if (!videoRef.current) return;
          const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions());
          const label = detection ? 'FACE DETECTED' : 'NO FACE';
          setResult(label);
          console.log(`[face-test] ${label}`);
        }, 1000);

      } catch (err) {
        if (cancelled) return;
        console.error('[face-test] failed:', err);
        setStatus('Failed');
        setError(err.message || String(err));
      }
    }

    run();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', padding: 32, fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: 16 }}>face-api.js detection test</h1>
      <p>Status: {status}{source ? ` (model source: ${source})` : ''}</p>
      {error && <p style={{ color: '#ff3b30' }}>Error: {error}</p>}
      <p style={{
        fontSize: 32,
        margin: '16px 0',
        color: result === 'FACE DETECTED' ? '#34c759' : result === 'NO FACE' ? '#ff3b30' : '#8e8e93'
      }}>
        {result}
      </p>
      <video ref={videoRef} muted playsInline style={{ width: 480, borderRadius: 8, border: '1px solid #333' }} />
    </div>
  );
}
