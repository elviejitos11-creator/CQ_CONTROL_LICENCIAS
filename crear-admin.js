const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const password = process.env.CQ_ADMIN_PASSWORD;

if (!password || password.length < 12) {
  console.error("ERROR: La contraseña debe tener al menos 12 caracteres.");
  process.exit(1);
}

const db = new Database("data/cq_control.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS administradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )
`);

const hash = bcrypt.hashSync(password, 12);

db.prepare(`
  INSERT INTO administradores (usuario, password_hash)
  VALUES (?, ?)
  ON CONFLICT(usuario)
  DO UPDATE SET password_hash = excluded.password_hash
`).run("admin", hash);

db.close();
console.log("ADMINISTRADOR CREADO CORRECTAMENTE");