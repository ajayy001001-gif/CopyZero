import { useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { auth } from '../config/firebase';

const FLUSH_INTERVAL_MS = 15000;
const MAX_BATCH_SIZE = 50;
const MAX_METADATA_STRING_LEN = 200;
const IDLE_THRESHOLD_MS = 10000;

function truncate(value) {
  if (typeof value !== 'string') return value;
  return value.length > MAX_METADATA_STRING_LEN ? value.slice(0, MAX_METADATA_STRING_LEN) : value;
}

/**
 * Tracks exam-taking behavioral signals (tab switches, focus loss, copy/
 * paste, right-click, refresh attempts, idle time) into a local ref queue
 * and periodically flushes it to POST /api/events/batch. Only active while
 * isExamActive is true. Events are held locally (never lost) until a
 * submissionId is known, since the backend ties every event to a specific
 * submission for ownership checks.
 */
export default function useBehavioralTracker({ isExamActive, submissionId, assignmentId }) {
  const queueRef = useRef([]);
  const submissionIdRef = useRef(submissionId);
  const mouseLeftAtRef = useRef(null);
  const flushingRef = useRef(false);

  useEffect(() => {
    submissionIdRef.current = submissionId;
  }, [submissionId]);

  const pushEvent = useCallback((eventType, metadata = {}) => {
    const entry = { eventType, timestamp: new Date().toISOString(), metadata: {} };
    if (typeof metadata.duration === 'number') entry.metadata.duration = metadata.duration;
    if (metadata.details != null) entry.metadata.details = truncate(String(metadata.details));
    queueRef.current.push(entry);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (queueRef.current.length === 0) return;
    if (!submissionIdRef.current) return; // hold events until a submission exists
    if (!auth.currentUser) return; // never send before the student is authenticated

    flushingRef.current = true;
    const batch = queueRef.current.slice(0, MAX_BATCH_SIZE);
    try {
      await api.post('/api/events/batch', {
        submissionId: submissionIdRef.current,
        events: batch
      });
      queueRef.current = queueRef.current.slice(batch.length);
    } catch {
      // Offline or request failed — leave the batch queued, next tick retries.
    } finally {
      flushingRef.current = false;
    }
  }, []);

  // Call on exam submit, with the freshly-created submissionId if the caller
  // only just received it, to drain any events queued during composition.
  const flushNow = useCallback(async (finalSubmissionId) => {
    if (finalSubmissionId) submissionIdRef.current = finalSubmissionId;
    pushEvent('exam_submit');
    let guard = 0;
    while (queueRef.current.length > 0 && submissionIdRef.current && guard < 10) {
      await flush();
      guard += 1;
    }
  }, [flush, pushEvent]);

  useEffect(() => {
    if (!isExamActive) return;

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') pushEvent('tab_switch');
    }
    function onBlur() {
      pushEvent('window_blur');
    }
    function onFocus() {
      pushEvent('window_focus');
    }
    function onFullscreenChange() {
      pushEvent(document.fullscreenElement ? 'fullscreen_enter' : 'fullscreen_exit');
    }
    function onCopy() {
      pushEvent('copy_attempt');
    }
    function onCut() {
      pushEvent('copy_attempt', { details: 'cut' });
    }
    function onPaste() {
      pushEvent('paste_attempt');
    }
    function onContextMenu() {
      pushEvent('right_click');
    }
    function onBeforeUnload() {
      pushEvent('refresh_attempt');
    }
    function onMouseLeave() {
      mouseLeftAtRef.current = Date.now();
    }
    function onMouseEnter() {
      if (mouseLeftAtRef.current) {
        const duration = Date.now() - mouseLeftAtRef.current;
        if (duration > IDLE_THRESHOLD_MS) pushEvent('idle_long', { duration });
        mouseLeftAtRef.current = null;
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    pushEvent('exam_start');

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('mouseenter', onMouseEnter);
    };
    // assignmentId isn't used directly here (it's implied by submissionId
    // server-side) but is accepted for symmetry with how the caller wires
    // this hook once both ids are known.
  }, [isExamActive, pushEvent, assignmentId]);

  useEffect(() => {
    if (!isExamActive) return;
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', flush);
    };
  }, [isExamActive, flush]);

  return { flushNow };
}
