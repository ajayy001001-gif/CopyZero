const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();
require('./config/firebase');
const { verifyToken, checkVITEmail } = require('./middleware/auth');
const { getProviderStatus } = require('./services/aiProviderService');
const { getGroqUsage } = require('./services/groqEvaluationService');

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

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin/non-browser requests (no Origin header) and any
    // explicitly allowlisted frontend origin.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(helmet());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
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
// Open to both roles (not just professor) since the "Configure AI" panel is
// shown on both dashboards. Never exposes keys — only call counts.
app.get('/api/health/ai', verifyToken, checkVITEmail, (req, res) => {
  try {
    const groq = getGroqUsage();
    const status = getProviderStatus();
    res.json({
      groq,
      nim: status.nim,
      huggingFace: status.huggingFace,
      activeProvider: 'groq'
    });
  } catch (error) {
    console.error('AI health check error:', error);
    res.status(500).json({ error: 'Failed to check AI provider status' });
  }
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});
