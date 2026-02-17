import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import brandsRoutes from './routes/brands';
import artifactsRoutes from './routes/artifacts';
import verifyRoutes from './routes/verify';
import listingsRoutes from './routes/listings';
import salesRoutes from './routes/sales';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Trust proxy for Render/Vercel deployments (required for rate limiting)
app.set('trust proxy', 1);

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/auth', authLimiter, authRoutes);
app.use('/brands', brandsRoutes);
app.use('/artifacts', artifactsRoutes);
app.use('/verify', verifyRoutes);
app.use('/listings', listingsRoutes);
app.use('/sales', salesRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] CORS origin: ${CORS_ORIGIN}`);

  // Pre-load @provablehq/sdk for BHP256 computation (takes a few seconds)
  import('./services/bhp256').then(({ initBHP256 }) => {
    initBHP256().then((ok) => {
      console.log(`[Server] BHP256 service: ${ok ? 'ready' : 'unavailable'}`);
    });
  }).catch(() => {
    console.warn('[Server] BHP256 service not available');
  });
});
