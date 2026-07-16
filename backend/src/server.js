const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();
require('./config/firebase');

const app = express();

const PORT = process.env.PORT || 5000;

// Render (and most PaaS providers) sit behind a reverse proxy; trust the
// first hop so req.ip / X-Forwarded-For are read correctly for rate limiting.
app.set('trust proxy', 1);

const KNOWN_FRONTEND_ORIGINS = ['https://copy-zero.vercel.app'];

const allowedOrigins = [...new Set([
  ...KNOWN_FRONTEND_ORIGINS,
  ...(process.env.FRONTEND_URLS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
])];

// In local dev, Vite may fall back to a different port (5174, 5175, …) when
// its default is already taken, which would otherwise break CORS on every
// shift. Outside production, accept any localhost/127.0.0.1 origin. In
// production only the explicit allowlist applies.
const isProduction = process.env.NODE_ENV === 'production';
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin/non-browser requests (no Origin header) and any
    // explicitly allowlisted frontend origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (!isProduction && LOCALHOST_ORIGIN.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(helmet());

// 20/15min is the right brute-force protection for production login, but it's
// far too tight for local dev where you log in/out across several test
// accounts and React re-fetches the profile on every reload. Disable it
// outside production; the generalLimiter (300/15min) still guards against
// runaway request loops.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProduction,
  message: { error: 'Too many requests, please try again later' }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

app.use('/api/auth', authLimiter);
app.use(generalLimiter);

app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '3mb' }));

app.get('/', (req, res) => {
  res.json({
    message: 'VIT Academic Integrity Platform API',
    status: 'running',
    version: '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
const professorRoutes = require('./routes/professorRoutes');
app.use('/api/professor', professorRoutes);
const studentRoutes = require('./routes/studentRoutes');
app.use('/api/student', studentRoutes);
const eventRoutes = require('./routes/eventRoutes');
app.use('/api/events', eventRoutes);
const integrityRoutes = require('./routes/integrityRoutes');
app.use('/api/integrity', integrityRoutes);
const aiRoutes = require('./routes/aiRoutes');
app.use('/api/ai', aiRoutes);
const proctorRoutes = require('./routes/proctorRoutes');
app.use('/api/proctor', proctorRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: 'Something went wrong!'
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
});

// An unhandled rejection means the process is in an unknown state, so we
// still exit rather than limp on — but gracefully: stop accepting new
// connections and let in-flight requests finish first, instead of dropping
// them mid-response. The forced exit is a safety net in case close() hangs
// (e.g. a request stuck waiting on a slow Firestore call).
function shutdown(err, signal) {
  console.error(`${signal} — shutting down gracefully...`);
  console.error(err?.name, err?.message);

  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(() => {
    clearTimeout(forceExit);
    process.exit(1);
  });
}

process.on('unhandledRejection', (err) => shutdown(err, 'UNHANDLED REJECTION! 💥'));
process.on('uncaughtException', (err) => shutdown(err, 'UNCAUGHT EXCEPTION! 💥'));
