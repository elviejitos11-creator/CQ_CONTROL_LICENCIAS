const Database = require("better-sqlite3");
const db = new Database("./data/cq_control.db");

try {
  const columnas = db.prepare("PRAGMA table_info(licencias)")
    .all().map(c => c.name);

  const cambios = [
    ["clave_hash", "TEXT"],
    ["dispositivo_id", "TEXT"]
  ];

  const agregar = cambios.filter(([nombre]) => !columnas.includes(nombre));

  db.transaction(() => {
    for (const [nombre, tipo] of agregar) {
      db.exec(`ALTER TABLE licencias ADD COLUMN ${nombre} ${tipo}`);
      console.log("COLUMNA AGREGADA:", nombre);
    }
  })();

  console.log("COLUMNAS FINALES:");
  console.log(
    db.prepare("PRAGMA table_info(licencias)")
      .all().map(c => c.name).join(", ")
  );

  console.log("ESTRUCTURA DE LICENCIAS PREPARADA");
} catch (error) {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
