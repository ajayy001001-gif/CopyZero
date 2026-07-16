const { db } = require('../config/firebase');
const { getDocument, collections } = require('../services/databaseService');

const ALLOWED_EVENT_TYPES = [
  'tab_switch', 'window_blur', 'window_focus', 'fullscreen_exit',
  'fullscreen_enter', 'copy_attempt', 'paste_attempt', 'right_click',
  'refresh_attempt', 'idle_long', 'exam_start', 'exam_submit'
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
// req.user (never req.body). assignmentId is always derived server-side from
// the submission record (never trusted from the body) so a student can't
// attach events to someone else's timeline.
async function batchEvents(req, res) {
  try {
    const studentId = req.user.uid;
    const { submissionId, events } = req.body;

    if (!submissionId || typeof submissionId !== 'string') {
      return res.status(400).json({ error: 'submissionId is required' });
    }
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }
    if (events.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ error: `Batch too large — max ${MAX_BATCH_SIZE} events per call` });
    }

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.studentId !== studentId) {
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

    events.forEach(evt => {
      const docRef = collectionRef.doc();
      batch.set(docRef, {
        studentId,
        assignmentId: submission.assignmentId,
        submissionId,
        eventType: evt.eventType,
        timestamp: isValidTimestamp(evt.timestamp) ? evt.timestamp : now,
        metadata: sanitizeMetadata(evt.metadata),
        receivedAt: now
      });
    });

    await batch.commit();
    return res.status(204).send();

  } catch (error) {
    console.error('Batch events error:', error);
    return res.status(500).json({ error: 'Failed to record events' });
  }
}

// GET /api/events/:submissionId — professor only, ownership-checked via the
// submission's assignment. Cursor-based pagination, max 100 per page.
async function getEventTimeline(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.params;
    const { cursor } = req.query;
    const PAGE_SIZE = 100;

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view events for your own assignments' });
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
