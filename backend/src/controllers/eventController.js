const { db } = require('../config/firebase');
const { getDocument, collections } = require('../services/databaseService');

const ALLOWED_EVENT_TYPES = [
  'tab_switch', 'window_blur', 'window_focus', 'fullscreen_exit',
  'fullscreen_enter', 'copy_attempt', 'paste_attempt', 'right_click',
  'refresh_attempt', 'idle_long', 'exam_start', 'exam_submit',
  'webcam_no_face', 'webcam_multiple_faces', 'screen_share_stopped'
];
const MAX_BATCH_SIZE = 50;
const MAX_METADATA_STRING_LEN = 200;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // sanity cap, not a real exam length

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return {};
  const clean = {};
  if (typeof metadata.duration === 'number' && Number.isFinite(metadata.duration) && metadata.duration >= 0) {
    clean.duration = Math.min(metadata.duration, MAX_DURATION_MS);
  }
  if (typeof metadata.details === 'string') {
    clean.details = metadata.details.slice(0, MAX_METADATA_STRING_LEN);
  }
  return clean;
}

function isValidTimestamp(value) {
  if (typeof value !== 'string') return false;
  const t = new Date(value).getTime();
  return Number.isFinite(t);
}

// POST /api/events/batch — student only. studentId always comes from
// req.user (never req.body). assignmentId/assessmentId is always derived
// server-side from the submission record (never trusted from the body) so a
// student can't attach events to someone else's timeline.
//
// contextType ('assignment'|'assessment') is optional and defaults to
// 'assignment' — every existing caller (useBehavioralTracker/useProctoring
// on the assignment flow) omits it, so this preserves their exact prior
// behavior unchanged; only assessment callers pass it explicitly.
async function batchEvents(req, res) {
  try {
    const studentId = req.user.uid;
    const { submissionId, events, contextType } = req.body;
    const type = contextType === 'assessment' ? 'assessment' : 'assignment';

    if (!submissionId || typeof submissionId !== 'string') {
      return res.status(400).json({ error: 'submissionId is required' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }
    if (events.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ error: `Batch too large — max ${MAX_BATCH_SIZE} events per call` });
    }

    const parentSubmission = type === 'assessment'
      ? await getDocument(collections.ASSESSMENT_SUBMISSIONS, submissionId)
      : await getDocument(collections.SUBMISSIONS, submissionId);
    if (!parentSubmission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (parentSubmission.studentId !== studentId) {
      return res.status(403).json({ error: 'You can only log events for your own submission' });
    }

    for (const evt of events) {
      if (!evt || typeof evt !== 'object' || !ALLOWED_EVENT_TYPES.includes(evt.eventType)) {
        return res.status(400).json({ error: 'Invalid event type in batch' });
      }
    }

    const now = new Date().toISOString();
    const batch = db.batch();
    const collectionRef = db.collection(collections.EVENTS);
    const eventIds = [];

    events.forEach(evt => {
      const docRef = collectionRef.doc();
      eventIds.push(docRef.id);
      batch.set(docRef, {
        studentId,
        contextType: type,
        assignmentId: type === 'assignment' ? parentSubmission.assignmentId : null,
        assessmentId: type === 'assessment' ? parentSubmission.assessmentId : null,
        submissionId,
        eventType: evt.eventType,
        timestamp: isValidTimestamp(evt.timestamp) ? evt.timestamp : now,
        metadata: sanitizeMetadata(evt.metadata),
        receivedAt: now
      });
    });

    await batch.commit();
    // IDs returned in the same order as the submitted events — needed so
    // proctoring evidence (webcam snapshots/screen clips) can be attached to
    // the specific event it was captured for via POST /api/events/evidence.
    return res.status(201).json({ eventIds });

  } catch (error) {
    console.error('Batch events error:', error);
    return res.status(500).json({ error: 'Failed to record events' });
  }
}

// GET /api/events/:submissionId — professor only, ownership-checked via the
// parent assignment or assessment. Cursor-based pagination, max 100 per page.
// Tries the assignment-submission lookup first (existing, most common path,
// unchanged), falls back to assessment-submission only if that misses.
async function getEventTimeline(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.params;
    const { cursor } = req.query;
    const PAGE_SIZE = 100;

    let parent;
    const assignmentSubmission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (assignmentSubmission) {
      parent = await getDocument(collections.ASSIGNMENTS, assignmentSubmission.assignmentId);
    } else {
      const assessmentSubmission = await getDocument(collections.ASSESSMENT_SUBMISSIONS, submissionId);
      if (!assessmentSubmission) {
        return res.status(404).json({ error: 'Submission not found' });
      }
      parent = await getDocument(collections.ASSESSMENTS, assessmentSubmission.assessmentId);
    }

    if (!parent) {
      return res.status(404).json({ error: 'Assignment or assessment not found' });
    }
    if (parent.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view events for your own assignments or assessments' });
    }

    let query = db.collection(collections.EVENTS)
      .where('submissionId', '==', submissionId)
      .orderBy('timestamp', 'asc')
      .limit(PAGE_SIZE);

    if (typeof cursor === 'string' && cursor) {
      const cursorDoc = await db.collection(collections.EVENTS).doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();
    const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const nextCursor = snapshot.docs.length === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null;

    return res.status(200).json({ count: events.length, events, nextCursor });

  } catch (error) {
    console.error('Get event timeline error:', error);
    return res.status(500).json({ error: 'Failed to fetch event timeline' });
  }
}

module.exports = { batchEvents, getEventTimeline };
