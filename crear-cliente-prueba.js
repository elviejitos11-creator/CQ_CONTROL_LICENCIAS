const Database = require("better-sqlite3");
const db = new Database("./data/cq_control.db");

const nombre = "CLIENTE PRUEBA LOBO 1";
const email = "prueba-lobo1@example.invalid";

let cliente = db.prepare(
  "SELECT id, nombre, email FROM clientes WHERE email = ?"
).get(email);

if (!cliente) {
  const resultado = db.prepare(
    "INSERT INTO clientes (nombre, email) VALUES (?, ?)"
  ).run(nombre, email);

  cliente = db.prepare(
    "SELECT id, nombre, email FROM clientes WHERE id = ?"
  ).get(resultado.lastInsertRowid);
}

console.log("CLIENTE PREPARADO:");
console.log(cliente);
db.close();
