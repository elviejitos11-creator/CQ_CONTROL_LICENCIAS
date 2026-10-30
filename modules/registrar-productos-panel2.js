module.exports = function registrarProductosPanel2(db) {
  const productos = [
    ["PANENEL2_TELEGRAM_UN_POST", "PANENEL2 TELEGRAM UN POST"],
    ["PANAL2_TELEGRAM_DOS_POST", "PANAL2 TELEGRAM DOS POST"]
  ];

  const insertar = db.prepare(
    "INSERT OR IGNORE INTO productos (codigo,nombre) VALUES (?,?)"
  );

  db.transaction(() => {
    for (const [codigo, nombre] of productos) {
      insertar.run(codigo, nombre);
    }
  })();

  console.log("PANEL2: productos registrados");
};