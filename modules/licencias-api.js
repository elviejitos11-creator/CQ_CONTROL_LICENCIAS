"use strict";

const {
  PRODUCTOS, prepararLicencias, generarClave,
  hashClave, validarLicencia
} = require("./licencias");

module.exports = function conectarLicencias(app, db, requiereAdmin) {
  prepararLicencias(db);

  app.get("/api/licencias", requiereAdmin, (req, res) => {
    const filas = db.prepare(`
      SELECT id, cliente_id, producto_codigo, estado,
             dispositivo_id, vence_en, creado_en
      FROM licencias ORDER BY id DESC
    `).all();
    res.json(filas);
  });

  app.post("/api/licencias", requiereAdmin, (req, res) => {
    const { cliente_id, producto_codigo, dias } = req.body || {};
    const clienteId = Number(cliente_id);
    const duracion = Number(dias);

    if (!Number.isSafeInteger(clienteId) || clienteId <= 0 ||
        !PRODUCTOS[producto_codigo] ||
        !Number.isInteger(duracion) || duracion < 1 || duracion > 365) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const cliente = db.prepare(
      "SELECT id FROM clientes WHERE id=?"
    ).get(clienteId);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no existe" });
    }

    const clave = generarClave();
    const vence = new Date(Date.now() + duracion * 86400000).toISOString();

    const resultado = db.prepare(`
      INSERT INTO licencias
      (cliente_id, producto_codigo, clave_hash, estado, vence_en)
      VALUES (?, ?, ?, 'activa', ?)
    `).run(clienteId, producto_codigo, hashClave(clave), vence);

    res.status(201).json({
      id: resultado.lastInsertRowid.toString(),
      clave,
      producto_codigo,
      vence_en: vence
    });
  });

  app.patch("/api/licencias/:id/estado", requiereAdmin, (req, res) => {
    const id = Number(req.params.id);
    const estado = req.body?.estado;

    if (!Number.isSafeInteger(id) || id <= 0 ||
        !["activa", "suspendida"].includes(estado)) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const resultado = db.prepare(
      "UPDATE licencias SET estado=? WHERE id=?"
    ).run(estado, id);

    if (!resultado.changes) {
      return res.status(404).json({ error: "Licencia no existe" });
    }

    res.json({ ok: true, id, estado });
  });

  // CQ_CONTROL_VERIFICAR_INSTALACION_PANEL3_V1
  app.post("/api/licencias/verificar-instalacion", (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      const datos = req.body || {};
      const producto = String(datos.producto || "");

      if (![
        "PANEL3_TELEGRAM_CLIENTE_1",
        "PANEL3_TELEGRAM_CLIENTE_2"
      ].includes(producto)) {
        return res.status(403).json({
          autorizada: false,
          motivo: "producto_no_autorizado"
        });
      }

      const resultado = validarLicencia(db, datos);

      if (resultado.autorizada !== true) {
        return res.status(403).json(resultado);
      }

      return res.json(resultado);
    } catch (error) {
      console.error("Verificar instalacion:", error.message);
      return res.status(500).json({
        autorizada: false,
        motivo: "error_servidor"
      });
    }
  });
  app.post("/api/licencias/verificar", (req, res) => {
    const datos = req.body || {};
    const resultado = validarLicencia(db, datos);
    res.set("Cache-Control", "no-store");
    res.json(resultado);
  });
};
