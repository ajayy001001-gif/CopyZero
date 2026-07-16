import { useEffect, useState } from 'react';
import { proctorAPI } from '../../services/api';

const FLAGGED_TYPES = ['webcam_no_face', 'webcam_multiple_faces', 'screen_share_stopped'];

const LABELS = {
  tab_switch: 'Tab switch',
  window_blur: 'Window lost focus',
  window_focus: 'Window regained focus',
  fullscreen_exit: 'Exited fullscreen',
  fullscreen_enter: 'Entered fullscreen',
  copy_attempt: 'Copy attempt',
  paste_attempt: 'Paste attempt',
  right_click: 'Right-click',
  refresh_attempt: 'Refresh attempt',
  idle_long: 'Idle',
  exam_start: 'Exam started',
  exam_submit: 'Exam submitted',
  webcam_no_face: 'No face detected',
  webcam_multiple_faces: 'Multiple faces detected',
  screen_share_stopped: 'Screen sharing stopped'
};

function EvidenceViewer({ eventId }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(false);

  async function handleView() {
    if (shown) { setShown(false); return; }
    setShown(true);
    if (evidence) return;
    setLoading(true);
    try {
      const res = await proctorAPI.getEvidenceForEvent(eventId);
      setEvidence(res.data.evidence || []);
    } catch {
      setEvidence([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleView} className="link text-xs">
        {shown ? 'Hide evidence' : 'View evidence'}
      </button>
      {shown && (
        <div className="mt-2 flex flex-wrap gap-2">
          {loading && <p className="text-xs text-[var(--color-text-tertiary)]">Loading...</p>}
          {!loading && evidence?.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)]">No evidence attached</p>
          )}
          {!loading && evidence?.map(clip => (
            <div key={clip.id}>
              {clip.mimeType === 'image/jpeg' ? (
                <img
                  src={`data:image/jpeg;base64,${clip.data}`}
                  alt="Webcam snapshot"
                  className="rounded-md border border-[var(--color-border)]"
                  style={{ width: 160, height: 'auto' }}
                />
              ) : (
                <video
                  src={`data:video/webm;base64,${clip.data}`}
                  controls
                  className="rounded-md border border-[var(--color-border)]"
                  style={{ width: 240 }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventTimeline({ submissionId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!submissionId) return;
    fetchTimeline();
  }, [submissionId]);

  async function fetchTimeline() {
    try {
      const res = await proctorAPI.getEventTimeline(submissionId);
      setEvents(res.data.events || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load event timeline');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;
  if (error) return <p className="text-xs text-[var(--color-text-tertiary)]">{error}</p>;
  if (events.length === 0) return <p className="text-xs text-[var(--color-text-tertiary)]">No behavioral events recorded.</p>;

  const flaggedCount = events.filter(e => FLAGGED_TYPES.includes(e.eventType)).length;

  return (
    <div>
      {flaggedCount > 0 && (
        <p className="text-xs mb-3" style={{ color: 'var(--color-accent-error)' }}>
          {flaggedCount} proctoring flag{flaggedCount !== 1 ? 's' : ''} during this exam
        </p>
      )}
      <div className="space-y-2 max-h-96 overflow-auto">
        {events.map(evt => {
          const flagged = FLAGGED_TYPES.includes(evt.eventType);
          return (
            <div
              key={evt.id}
              className="flex items-start justify-between p-2 rounded-md text-xs"
              style={{ background: flagged ? 'rgba(255, 59, 48, 0.06)' : 'transparent' }}
            >
              <div>
                <span style={{ color: flagged ? 'var(--color-accent-error)' : undefined }}>
                  {LABELS[evt.eventType] || evt.eventType}
                </span>
                <span className="text-[var(--color-text-tertiary)] ml-2">
                  {new Date(evt.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {evt.metadata?.duration && (
                  <span className="text-[var(--color-text-tertiary)] ml-2">{Math.round(evt.metadata.duration / 1000)}s</span>
                )}
              </div>
              {flagged && <EvidenceViewer eventId={evt.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
