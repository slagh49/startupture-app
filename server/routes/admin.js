const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../auth');

function log(req, action, target, detail) {
  db.prepare(
    'INSERT INTO logs (user_id, username, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.user?.id || null, req.user?.username || 'admin',
    action, target || null,
    typeof detail === 'object' ? JSON.stringify(detail) : (detail || null),
    req.ip
  );
}

// ══════════════════════════════════════
//  USERS
// ══════════════════════════════════════
router.get('/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, role, created_at, last_login FROM users ORDER BY created_at').all());
});

router.post('/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'Nom d\'utilisateur déjà pris' });
  }
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)').run(id, username, hash, role || 'player');
  log(req, 'CREATE_USER', id, { username, role });
  res.json({ id, username, role: role || 'player' });
});

router.put('/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Mot de passe manquant' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  log(req, 'RESET_PASSWORD', req.params.id);
  res.json({ ok: true });
});

router.put('/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'player'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  log(req, 'CHANGE_ROLE', req.params.id, { role });
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  log(req, 'DELETE_USER', req.params.id, { username: user?.username });
  res.json({ ok: true });
});

// ══════════════════════════════════════
//  RESOURCES EDIT
// ══════════════════════════════════════
router.get('/resources', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM resources ORDER BY sort_order, category, label').all());
});

router.put('/resources/:id', requireAdmin, (req, res) => {
  const { label, category, color } = req.body;
  if (!label || !color) return res.status(400).json({ error: 'Champs manquants' });
  db.prepare('UPDATE resources SET label=?, category=?, color=? WHERE id=?').run(label, category, color, req.params.id);
  log(req, 'UPDATE_RESOURCE', req.params.id, { label, color });
  res.json(db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id));
});

router.post('/resources', requireAdmin, (req, res) => {
  const { id, label, category, color, sort_order } = req.body;
  if (!id || !label || !category || !color) return res.status(400).json({ error: 'Champs manquants' });
  if (db.prepare('SELECT id FROM resources WHERE id = ?').get(id)) {
    return res.status(409).json({ error: 'ID déjà existant' });
  }
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM resources').get().m || 0;
  db.prepare('INSERT INTO resources (id, label, category, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(id, label, category, color, sort_order || maxOrder + 10);
  log(req, 'CREATE_RESOURCE', id, { label });
  res.json(db.prepare('SELECT * FROM resources WHERE id = ?').get(id));
});

// ══════════════════════════════════════
//  LOGS
// ══════════════════════════════════════
router.get('/logs', requireAdmin, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const rows = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as n FROM logs').get().n;
  res.json({ logs: rows, total });
});

// ══════════════════════════════════════
//  RESET
// ══════════════════════════════════════
router.post('/reset/map', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM modules').run();
  db.prepare('DELETE FROM markers').run();
  log(req, 'RESET_MAP', null, 'Carte et modules supprimés');
  res.json({ ok: true });
});

router.post('/reset/players', requireAdmin, (req, res) => {
  db.prepare("DELETE FROM users WHERE role = 'player'").run();
  log(req, 'RESET_PLAYERS', null, 'Tous les joueurs supprimés');
  res.json({ ok: true });
});

router.post('/reset/logs', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM logs').run();
  // Re-log the action itself
  db.prepare(
    'INSERT INTO logs (user_id, username, action, detail, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, req.user.username, 'RESET_LOGS', 'Journaux effacés', req.ip);
  res.json({ ok: true });
});

router.post('/reset/all', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM modules').run();
  db.prepare('DELETE FROM markers').run();
  db.prepare("DELETE FROM users WHERE role = 'player'").run();
  db.prepare('DELETE FROM logs').run();
  log(req, 'RESET_ALL', null, 'Réinitialisation totale');
  res.json({ ok: true });
});

module.exports = router;
