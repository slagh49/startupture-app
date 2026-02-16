const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

// ── Logging helper ──
function log(req, action, target, detail) {
  db.prepare(
    'INSERT INTO logs (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.user?.id || null,
    req.user?.username || 'anonymous',
    action, target || null,
    typeof detail === 'object' ? JSON.stringify(detail) : (detail || null),
    req.ip
  );
}

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  db.prepare(
    'INSERT INTO logs (user_id, username, action, ip) VALUES (?, ?, ?, ?)'
  ).run(user.id, user.username, 'LOGIN', req.ip);

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res
    .cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 })
    .json({ token, user: { id: user.id, username: user.username, role: user.role, ui_theme: user.ui_theme || 'dark', ui_show_base_labels: (user.ui_show_base_labels==null?1:user.ui_show_base_labels) } });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  log(req, 'LOGOUT');
  res.clearCookie('token').json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, ui_theme, ui_show_base_labels, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Update current user's UI preferences (safe, minimal surface)
router.put('/auth/me', requireAuth, (req, res) => {
  const { ui_theme, ui_show_base_labels } = req.body || {};

  // Validate inputs (partial updates allowed)
  const updates = [];
  const params = [];

  if (ui_theme !== undefined) {
    if (!['dark', 'light'].includes(ui_theme)) {
      return res.status(400).json({ error: "ui_theme invalide (dark|light)" });
    }
    updates.push('ui_theme = ?');
    params.push(ui_theme);
  }

  if (ui_show_base_labels !== undefined) {
    const v = (ui_show_base_labels === true) ? 1
      : (ui_show_base_labels === false) ? 0
      : (ui_show_base_labels === 1 || ui_show_base_labels === 0) ? ui_show_base_labels
      : (ui_show_base_labels === '1' || ui_show_base_labels === '0') ? Number(ui_show_base_labels)
      : null;
    if (v === null) {
      return res.status(400).json({ error: "ui_show_base_labels invalide (0|1)" });
    }
    updates.push('ui_show_base_labels = ?');
    params.push(v);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "Aucune préférence fournie" });
  }

  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  log(req, 'UPDATE_PREFS', req.user.id, { ui_theme, ui_show_base_labels });

  const user = db.prepare('SELECT id, username, role, ui_theme, ui_show_base_labels, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ══════════════════════════════════════
//  RESOURCES
// ══════════════════════════════════════
router.get('/resources', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM resources ORDER BY sort_order, category, label').all();
  res.json(rows);
});

// ══════════════════════════════════════
//  MARKERS
// ══════════════════════════════════════
router.get('/markers', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM markers ORDER BY created_at').all());
});

router.post('/markers', requireAuth, (req, res) => {
  const { type, name, description, nx, ny } = req.body;
  if (!type || !name || nx == null || ny == null) return res.status(400).json({ error: 'Champs manquants' });
  const id = uuidv4();
  db.prepare(
    'INSERT INTO markers (id, type, name, description, nx, ny, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, type, name, description || '', nx, ny, req.user.id);
  log(req, 'CREATE_MARKER', id, { type, name });
  res.json(db.prepare('SELECT * FROM markers WHERE id = ?').get(id));
});

router.put('/markers/:id', requireAuth, (req, res) => {
  const { name, description, nx, ny } = req.body;
  db.prepare(
    "UPDATE markers SET name=?, description=?, nx=?, ny=?, updated_at=datetime('now') WHERE id=?"
  ).run(name, description, nx, ny, req.params.id);
  log(req, 'UPDATE_MARKER', req.params.id, { name });
  res.json(db.prepare('SELECT * FROM markers WHERE id = ?').get(req.params.id));
});

router.delete('/markers/:id', requireAuth, (req, res) => {
  log(req, 'DELETE_MARKER', req.params.id);
  // CASCADE deletes linked modules via FK
  db.prepare('DELETE FROM markers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════
//  MODULES
// ══════════════════════════════════════
router.get('/modules', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM modules ORDER BY created_at').all());
});

router.post('/modules', requireAuth, (req, res) => {
  const { kind, name, base_id, resource_id, qty, dest_base_id, dest_recv_id } = req.body;
  if (!kind || !name || !base_id || !resource_id) return res.status(400).json({ error: 'Champs manquants' });
  // Verify base exists
  const base = db.prepare('SELECT id FROM markers WHERE id = ? AND type = ?').get(base_id, 'base');
  if (!base) return res.status(400).json({ error: 'Base introuvable' });
  const id = uuidv4();
  db.prepare(
    'INSERT INTO modules (id, kind, name, base_id, resource_id, qty, dest_base_id, dest_recv_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, kind, name, base_id, resource_id, qty || null, dest_base_id || null, dest_recv_id || null, req.user.id);
  log(req, 'CREATE_MODULE', id, { kind, name, resource_id });
  res.json(db.prepare('SELECT * FROM modules WHERE id = ?').get(id));
});

router.put('/modules/:id', requireAuth, (req, res) => {
  const { name, resource_id, qty, dest_base_id, dest_recv_id } = req.body;
  db.prepare(
    'UPDATE modules SET name=?, resource_id=?, qty=?, dest_base_id=?, dest_recv_id=? WHERE id=?'
  ).run(name, resource_id, qty || null, dest_base_id || null, dest_recv_id || null, req.params.id);
  log(req, 'UPDATE_MODULE', req.params.id, { name });
  res.json(db.prepare('SELECT * FROM modules WHERE id = ?').get(req.params.id));
});

router.delete('/modules/:id', requireAuth, (req, res) => {
  log(req, 'DELETE_MODULE', req.params.id);
  db.prepare('DELETE FROM modules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
