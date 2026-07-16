import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const FACE_CHECK_INTERVAL_MS = 5000;
const NO_FACE_CONSECUTIVE_THRESHOLD = 3; // 3 * 5s = 15s
const SCREEN_SEGMENT_MS = 15000;
const MAX_SEGMENTS_KEPT = 2;
const MAX_EVIDENCE_BYTES = 500 * 1024;
const MODEL_URL = '/models'; // see frontend/public/models/README.md for setup

// Presence/count detection only — no facial recognition or identity
// matching across the exam. Scope is intentionally limited to "is a face
// visible, and how many" to avoid the complexity/false-positive risk of
// re-identification.
export default function useProctoring({ isExamActive }) {
  const [webcamStatus, setWebcamStatus] = useState('idle'); // idle|requesting|granted|denied|monitoring
  const [screenStatus, setScreenStatus] = useState('idle');
  const [blockedReason, setBlockedReason] = useState(null);

  const videoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const segmentsRef = useRef([]); // rolling buffer, last MAX_SEGMENTS_KEPT Blobs
  const currentChunksRef = useRef([]);
  const noFaceStreakRef = useRef(0);
  const faceApiRef = useRef(null);
  const queueRef = useRef([]); // [{ eventType, timestamp, metadata, evidence: {type, blob, mimeType} | null }]

  const pushProctoringEvent = useCallback((eventType, evidence = null) => {
    queueRef.current.push({ eventType, timestamp: new Date().toISOString(), evidence });
  }, []);

  const captureWebcamSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.5); // data URL — split at upload time
  }, []);

  const saveScreenEvidence = useCallback((eventType) => {
    const segments = segmentsRef.current;
    if (segments.length === 0) return;
    // Best-effort: only the most recent segment is attempted (older ones are
    // more likely to push a 15s clip over the 500KB cap) — if even that's
    // too large, the event itself is still recorded, just without a clip.
    const latest = segments[segments.length - 1];
    if (latest.size > MAX_EVIDENCE_BYTES) {
      pushProctoringEvent(eventType, null);
      return;
    }
    pushProctoringEvent(eventType, { type: 'screen_clip', blob: latest, mimeType: 'video/webm' });
  }, [pushProctoringEvent]);

  // ── Webcam: face-api.js tinyFaceDetector, presence/count only ──────────
  useEffect(() => {
    if (!isExamActive) return;
    let cancelled = false;
    let intervalId = null;

    async function startWebcam() {
      setWebcamStatus('requesting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        webcamStreamRef.current = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        videoRef.current = video;

        const faceapi = await import('face-api.js');
        faceApiRef.current = faceapi;
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

        if (cancelled) return;
        setWebcamStatus('monitoring');

        // Reference snapshot at exam start — presence record only, not used
        // for any re-identification/matching later. useBehavioralTracker
        // already emits its own 'exam_start' event; this is a second,
        // proctoring-specific one carrying the snapshot as evidence.
        const refSnapshot = captureWebcamSnapshot();
        if (refSnapshot) {
          pushProctoringEvent('exam_start', { type: 'webcam_snapshot', blob: dataUrlToBlob(refSnapshot), mimeType: 'image/jpeg' });
        }

        intervalId = setInterval(async () => {
          if (!videoRef.current || !faceApiRef.current) return;
          const detections = await faceApiRef.current.detectAllFaces(
            videoRef.current,
            new faceApiRef.current.TinyFaceDetectorOptions()
          );
          if (detections.length === 0) {
            noFaceStreakRef.current += 1;
            if (noFaceStreakRef.current === NO_FACE_CONSECUTIVE_THRESHOLD) {
              const snap = captureWebcamSnapshot();
              pushProctoringEvent('webcam_no_face', snap ? { type: 'webcam_snapshot', blob: dataUrlToBlob(snap), mimeType: 'image/jpeg' } : null);
              noFaceStreakRef.current = 0;
            }
          } else {
            noFaceStreakRef.current = 0;
            if (detections.length > 1) {
              const snap = captureWebcamSnapshot();
              pushProctoringEvent('webcam_multiple_faces', snap ? { type: 'webcam_snapshot', blob: dataUrlToBlob(snap), mimeType: 'image/jpeg' } : null);
            }
          }
        }, FACE_CHECK_INTERVAL_MS);

      } catch (err) {
        if (cancelled) return;
        setWebcamStatus('denied');
        setBlockedReason('Webcam access is required for this exam. Please grant permission and reload.');
      }
    }

    startWebcam();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach(t => t.stop());
        webcamStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExamActive]);

  // ── Screen: getDisplayMedia + MediaRecorder rolling buffer ─────────────
  useEffect(() => {
    if (!isExamActive) return;
    let cancelled = false;
    let segmentTimer = null;

    async function startScreenShare() {
      setScreenStatus('requesting');
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        screenStreamRef.current = stream;
        setScreenStatus('sharing');

        stream.getVideoTracks()[0].addEventListener('ended', () => {
          saveScreenEvidence('screen_share_stopped');
          setScreenStatus('stopped');
        });

        function startSegment() {
          currentChunksRef.current = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) currentChunksRef.current.push(e.data);
          };
          recorder.onstop = () => {
            if (currentChunksRef.current.length) {
              const blob = new Blob(currentChunksRef.current, { type: 'video/webm' });
              segmentsRef.current = [...segmentsRef.current, blob].slice(-MAX_SEGMENTS_KEPT);
            }
          };
          recorder.start();
          recorderRef.current = recorder;
        }

        startSegment();
        segmentTimer = setInterval(() => {
          if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
          }
          startSegment();
        }, SCREEN_SEGMENT_MS);

      } catch (err) {
        if (cancelled) return;
        setScreenStatus('denied');
        setBlockedReason('Screen sharing is required for this exam. Please grant permission and reload.');
      }
    }

    startScreenShare();

    return () => {
      cancelled = true;
      if (segmentTimer) clearInterval(segmentTimer);
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop();
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExamActive]);

  // Call when the existing behavioral-tracker events (tab switch / fullscreen
  // exit) fire, so a screen-share clip gets attached to that same moment.
  const onSuspiciousBehavior = useCallback((eventType) => {
    if (eventType === 'tab_switch' || eventType === 'fullscreen_exit') {
      saveScreenEvidence('screen_share_stopped');
    }
  }, [saveScreenEvidence]);

  // Drains the queue once a submissionId exists — same pattern as
  // useBehavioralTracker, since evidence/events can't be persisted before a
  // submission record exists to own them.
  const flushNow = useCallback(async (submissionId) => {
    if (!submissionId || queueRef.current.length === 0) return;
    const queued = queueRef.current.splice(0, queueRef.current.length);

    for (const item of queued) {
      try {
        const { data } = await api.post('/api/events/batch', {
          submissionId,
          events: [{ eventType: item.eventType, timestamp: item.timestamp }]
        });
        const eventId = data?.eventIds?.[0];
        if (eventId && item.evidence) {
          const base64 = await blobToBase64(item.evidence.blob);
          if (base64 && estimateBytes(base64) <= MAX_EVIDENCE_BYTES) {
            await api.post('/api/events/evidence', {
              eventId,
              type: item.evidence.type,
              mimeType: item.evidence.mimeType,
              data: base64
            });
          }
        }
      } catch {
        // Best-effort — proctoring evidence should never block submission.
      }
    }
  }, []);

  return { webcamStatus, screenStatus, blockedReason, onSuspiciousBehavior, flushNow };
}

function dataUrlToBlob(dataUrl) {
  const [, base64] = dataUrl.split(',');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

function estimateBytes(base64) {
  const padding = (base64.match(/=*$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}
