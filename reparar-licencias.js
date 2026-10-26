const Database = require("better-sqlite3");
const db = new Database("./data/cq_control.db");

try {
  db.backup("./data/cq_control-antes-reparacion.db").then(() => {
    const columnas = db.prepare("PRAGMA table_info(licencias)").all();
    const nombres = columnas.map(c => c.name);

    console.log("COLUMNAS ACTUALES:", nombres.join(", "));

    if (!nombres.includes("producto_codigo")) {
      db.exec("ALTER TABLE licencias ADD COLUMN producto_codigo TEXT");
      console.log("COLUMNA producto_codigo AGREGADA");
    } else {
      console.log("LA COLUMNA YA EXISTE");
    }

    console.log("ESTRUCTURA FINAL:");
    console.log(
      db.prepare("PRAGMA table_info(licencias)")
        .all().map(c => c.name).join(", ")
    );

    db.close();
  }).catch(err => {
    console.error("ERROR EN RESPALDO:", err.message);
    db.close();
    process.exitCode = 1;
  });
} catch (err) {
  console.error("ERROR:", err.message);
  db.close();
  process.exitCode = 1;
}
