// Load .env if present (dev), docker-compose injects env vars directly in prod
try { require('dotenv').config(); } catch { /* dotenv optional in production */ }
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ── Core middleware ──
app.use(express.json());
app.use(cookieParser());
app.set('trust proxy', 1);
// NO express.static — every route is explicit and gated

// ── API routes (auth handled inside each router) ──
app.use('/api', require('./routes/api'));
app.use('/api/admin', require('./routes/admin'));

// ── Helpers ──
const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };

function sendPage(res, filename) {
  res.set(noCache).sendFile(path.join(PUBLIC_DIR, filename));
}

// ── Auth gate — verifies JWT cookie, redirects to /login on failure ──
function requirePageAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) throw new Error('no token');
    req.user = verifyToken(token);
    next();
  } catch {
    res.set(noCache).redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
}

// ── PUBLIC routes (no auth) ──
app.get('/login',      (req, res) => sendPage(res, 'login.html'));
app.get('/login.html', (req, res) => sendPage(res, 'login.html'));

// ── PROTECTED routes ──
app.get('/', requirePageAuth, (req, res) => sendPage(res, 'index.html'));

app.get('/index.html', requirePageAuth, (req, res) => sendPage(res, 'index.html'));

app.get('/admin.html', requirePageAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.set(noCache).redirect('/?err=forbidden');
  sendPage(res, 'admin.html');
});

// Map image — requires auth (prevents unauthenticated access to game assets)
app.get('/map_starrupture.png', requirePageAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'map_starrupture.png'));
});

// ── Catch-all: anything else → login ──
app.use((req, res) => {
  res.set(noCache).redirect('/login');
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌟 StarRupture Map Server`);
  console.log(`   Carte  → http://localhost:${PORT}`);
  console.log(`   Admin  → http://localhost:${PORT}/admin.html`);
  console.log(`   Login  → http://localhost:${PORT}/login\n`);
});
