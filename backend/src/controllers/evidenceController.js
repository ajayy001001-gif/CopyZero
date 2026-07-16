const { db } = require('../config/firebase');
const { createDocument, getDocument, collections, queryDocuments } = require('../services/databaseService');

const MAX_EVIDENCE_BYTES = 500 * 1024; // 500KB — keeps evidenceClips docs well under Firestore's 1MB limit
const ALLOWED_TYPES = ['webcam_snapshot', 'screen_clip'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'video/webm'];
const BASE64_PATTERN = /^[A-Za-z0-9+/]+=*$/;

function decodedByteLength(base64) {
  // Fast pre-check before spending CPU on a full decode of a huge string —
  // request body is already hard-capped at 3MB by express.json(), this adds
  // a tighter, evidence-specific ceiling.
  const padding = (base64.match(/=*$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// POST /api/events/evidence — student only. eventId ownership is verified
// (must be an event the student themselves created) before anything is
// stored, so a student can't attach evidence to someone else's event.
async function uploadEvidence(req, res) {
  try {
    const studentId = req.user.uid;
    const { eventId, type, data, mimeType } = req.body;

    if (!eventId || typeof eventId !== 'string') {
      return res.status(400).json({ error: 'eventId is required' });
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'type must be webcam_snapshot or screen_clip' });
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({ error: 'mimeType must be image/jpeg or video/webm' });
    }
    if (typeof data !== 'string' || !data.length || !BASE64_PATTERN.test(data)) {
      return res.status(400).json({ error: 'data must be a base64-encoded string' });
    }
    if (decodedByteLength(data) > MAX_EVIDENCE_BYTES) {
      return res.status(413).json({ error: `Evidence too large — max ${MAX_EVIDENCE_BYTES / 1024}KB` });
    }
    if (type === 'webcam_snapshot' && mimeType !== 'image/jpeg') {
      return res.status(400).json({ error: 'webcam_snapshot requires mimeType image/jpeg' });
    }
    if (type === 'screen_clip' && mimeType !== 'video/webm') {
      return res.status(400).json({ error: 'screen_clip requires mimeType video/webm' });
    }

    const eventDoc = await db.collection(collections.EVENTS).doc(eventId).get();
    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventDoc.data();
    if (event.studentId !== studentId) {
      return res.status(403).json({ error: 'You can only attach evidence to your own events' });
    }

    const evidence = await createDocument(collections.EVIDENCE_CLIPS, {
      eventId,
      studentId,
      submissionId: event.submissionId,
      type,
      mimeType,
      data,
      capturedAt: new Date().toISOString()
    });

    return res.status(201).json({ message: 'Evidence uploaded', evidenceId: evidence.id });

  } catch (error) {
    console.error('Upload evidence error:', error);
    return res.status(500).json({ error: 'Failed to upload evidence' });
  }
}

// GET /api/proctor/evidence/:eventId — professor only. Ownership verified
// via the full chain: event -> submission -> assignment -> professorId.
async function getEvidenceForEvent(req, res) {
  try {
    const professorId = req.user.uid;
    const { eventId } = req.params;

    const eventDoc = await db.collection(collections.EVENTS).doc(eventId).get();
    if (!eventDoc.exists) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventDoc.data();

    const submission = await getDocument(collections.SUBMISSIONS, event.submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view evidence for your own assignments' });
    }

    const clips = await queryDocuments(collections.EVIDENCE_CLIPS, [
      { field: 'eventId', operator: '==', value: eventId }
    ]);

    return res.status(200).json({ count: clips.length, evidence: clips });

  } catch (error) {
    console.error('Get evidence error:', error);
    return res.status(500).json({ error: 'Failed to fetch evidence' });
  }
}

module.exports = { uploadEvidence, getEvidenceForEvent };
