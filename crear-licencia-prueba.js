const Database = require("better-sqlite3");
const m = require("./modules/licencias");
const db = new Database("./data/cq_control.db");

const cliente = db.prepare(
  "SELECT id FROM clientes WHERE email = ?"
).get("prueba-lobo1@example.invalid");

if (!cliente) throw Error("CLIENTE NO EXISTE");

const anterior = db.prepare(`
  SELECT id FROM licencias
  WHERE cliente_id = ? AND producto_codigo = ?
  LIMIT 1
`).get(cliente.id, "LOBO_PRO_1");

if (anterior) {
  console.log("YA EXISTE UNA LICENCIA:", anterior.id);
} else {
  const clave = m.generarClave();
  const vence = new Date(Date.now() + 30 * 86400000).toISOString();

  const resultado = db.prepare(`
    INSERT INTO licencias
    (cliente_id, producto_id, producto_codigo, clave_hash, estado, vence_en)
    VALUES (?, ?, ?, ?, 'ACTIVA', ?)
  `).run(cliente.id, 1, "LOBO_PRO_1", m.hashClave(clave), vence);

  console.log("LICENCIA CREADA CORRECTAMENTE");
  console.log("ID:", resultado.lastInsertRowid);
  console.log("PRODUCTO: LOBO_PRO_1");
  console.log("CLAVE:", clave);
  console.log("VENCE:", vence);
  console.log("GUARDA LA CLAVE: NO SE MOSTRARA OTRA VEZ");
}

db.close();
