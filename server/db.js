const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'starrupture.db');

// Ensure data dir exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'player',  -- 'admin' | 'player'
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS markers (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    nx          REAL NOT NULL,
    ny          REAL NOT NULL,
    created_by  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS modules (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL,         -- 'send' | 'recv'
    name          TEXT NOT NULL,
    base_id       TEXT NOT NULL,
    resource_id   TEXT NOT NULL,
    qty           INTEGER,               -- send only
    dest_base_id  TEXT,                  -- send only
    dest_recv_id  TEXT,                  -- send only
    created_by    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (base_id) REFERENCES markers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resources (
    id        TEXT PRIMARY KEY,
    label     TEXT NOT NULL,
    category  TEXT NOT NULL,
    color     TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT,
    username   TEXT,
    action     TEXT NOT NULL,
    target     TEXT,
    detail     TEXT,
    ip         TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── SEED RESOURCES (if empty) ──
const resCount = db.prepare('SELECT COUNT(*) as n FROM resources').get();
if (resCount.n === 0) {
  const insertRes = db.prepare(
    'INSERT INTO resources (id, label, category, color, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const resources = [
    // Minerais bruts
    ['wolfram-ore',       'Minerai de Wolfram',                   'Minerais bruts',       '#e07030', 1],
    ['titanium-ore',      'Minerai de Titane',                    'Minerais bruts',       '#aabbcc', 2],
    ['calcium-ore',       'Minerai de Calcium',                   'Minerais bruts',       '#e8e0b8', 3],
    ['quartz-ore',        'Minerai de Quartz',                    'Minerais bruts',       '#88ddff', 4],
    ['sulphur-ore',       'Minerai de Soufre',                    'Minerais bruts',       '#ddcc22', 5],
    ['coalore',           'Minerai de Charbon',                   'Minerais bruts',       '#667788', 6],
    ['helium3',           'Hélium-3',                             'Minerais bruts',       '#cc88ff', 7],
    ['biomass',           'Biomasse',                             'Minerais bruts',       '#44cc66', 8],
    // Construction
    ['basic-building',    'Matériau Construction Basique',        'Construction',         '#7788aa', 10],
    ['interm-building',   'Matériau Construction Intermédiaire',  'Construction',         '#6699bb', 11],
    ['quartz-building',   'Matériau Construction Quartz',         'Construction',         '#55aacc', 12],
    // Produits Wolfram
    ['wolfram-bar',       'Lingot de Wolfram',                    'Produits Wolfram',     '#e07030', 20],
    ['wolfram-wire',      'Fil de Wolfram',                       'Produits Wolfram',     '#cc5520', 21],
    ['wolfram-plate',     'Plaque de Wolfram',                    'Produits Wolfram',     '#d06525', 22],
    ['wolfram-powder',    'Poudre de Wolfram',                    'Produits Wolfram',     '#bb4418', 23],
    // Produits Titane
    ['titanium-bar',      'Lingot de Titane',                     'Produits Titane',      '#aabbcc', 30],
    ['titanium-rod',      'Tige de Titane',                       'Produits Titane',      '#99aacc', 31],
    ['titanium-sheet',    'Feuille de Titane',                    'Produits Titane',      '#88aadd', 32],
    ['titanium-beam',     'Poutre de Titane',                     'Produits Titane',      '#77aaee', 33],
    // Produits Calcium
    ['calcium-powder',    'Poudre de Calcium',                    'Produits Calcium',     '#e0d8b0', 40],
    ['calcium-block',     'Bloc de Calcium',                      'Produits Calcium',     '#d5cda0', 41],
    ['calcite-sheets',    'Feuilles de Calcite',                  'Produits Calcium',     '#cac290', 42],
    // Hélium traité
    ['pressurized-helium','Hélium Pressurisé',                    'Produits Hélium',      '#cc88ff', 50],
    // Chimie
    ['sulphuric-acid',    'Acide Sulfurique',                     'Chimie',               '#aacc00', 60],
    ['chemicals',         'Produits Chimiques',                   'Chimie',               '#88ee44', 61],
    ['basic-fuel',        'Carburant Basique',                    'Chimie',               '#ff6644', 62],
    ['hardening-agent',   'Agent Durcissant',                     'Chimie',               '#ffaa44', 63],
    // Composants
    ['ceramics',          'Céramiques',                           'Composants',           '#ccaa88', 70],
    ['glass',             'Verre',                                'Composants',           '#aaddff', 71],
    ['synthetic-silicon', 'Silicium Synthétique',                 'Composants',           '#88aaff', 72],
    ['electronics',       'Électronique',                         'Composants',           '#44aaff', 73],
    ['battery',           'Batterie',                             'Composants',           '#ffcc00', 74],
    ['accumulator',       'Accumulateur',                         'Composants',           '#ffaa00', 75],
    ['inductor',          'Inducteur',                            'Composants',           '#ee9900', 76],
    ['stator',            'Stator',                               'Composants',           '#dd8800', 77],
    ['rotor',             'Rotor',                                'Composants',           '#cc7700', 78],
    // Composants avancés
    ['electromagnet',     'Électroaimant',                        'Composants avancés',   '#aa44ff', 80],
    ['supermagnet',       'Super-Aimant',                         'Composants avancés',   '#9922ff', 81],
    ['em-coil',           'Bobine Électromagnétique',             'Composants avancés',   '#8800ee', 82],
    ['turbine',           'Turbine',                              'Composants avancés',   '#7700cc', 83],
    ['stabilizer',        'Stabilisateur',                        'Composants avancés',   '#6600bb', 84],
    ['condenser',         'Condensateur',                         'Composants avancés',   '#5500aa', 85],
    ['pressure-tank',     'Réservoir Pressurisé',                 'Composants avancés',   '#440099', 86],
    ['valve',             'Vanne',                                'Composants avancés',   '#330088', 87],
    ['arc-reactor',       'Réacteur à Arc',                       'Composants avancés',   '#ff2266', 88],
    ['antimatter-gen',    'Générateur Antimatière',               'Composants avancés',   '#ff0044', 89],
    ['laser-emitter',     'Émetteur Laser',                       'Composants avancés',   '#ff4400', 90],
    ['scanner',           'Scanner',                              'Composants avancés',   '#ff6600', 91],
    // Équipements
    ['airlock',           'Sas',                                  'Équipements',          '#44ccaa', 100],
    ['applicator',        'Applicateur',                          'Équipements',          '#33bbaa', 101],
    ['biofilament',       'Biofilament',                          'Équipements',          '#22aa55', 102],
    ['bioprinter',        'Bio-Imprimante',                       'Équipements',          '#119944', 103],
    ['carbon-sonar',      'Sonar Carbone',                        'Équipements',          '#558877', 104],
    ['containment',       'Cuve de Confinement',                  'Équipements',          '#5566aa', 105],
    ['control-sys',       'Systèmes de Contrôle',                 'Équipements',          '#4455bb', 106],
    ['aerogel',           'Aérogel',                              'Équipements',          '#88ccee', 107],
    ['impeller',          'Impulseur',                            'Équipements',          '#77bbdd', 108],
  ];
  const insertAll = db.transaction(() => resources.forEach(r => insertRes.run(...r)));
  insertAll();
}

// ── SEED ADMIN (if no users) ──
const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get();
if (userCount.n === 0) {
  const adminPass = process.env.ADMIN_PASSWORD || 'admin1234';
  const hash = bcrypt.hashSync(adminPass, 10);
  const { v4: uuidv4 } = require('uuid');
  db.prepare(
    'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), 'admin', hash, 'admin');
  console.log(`[DB] Admin user created — password: ${adminPass}`);
}

module.exports = db;
