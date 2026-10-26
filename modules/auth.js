const bcrypt = require("bcryptjs");
const session = require("express-session");
const rateLimit = require("express-rate-limit");

function configurarAcceso(app, db) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("Falta SESSION_SECRET");
  }

  app.use(session({
    name: "cq.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    }
  }));

  const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false
  });

  app.post("/api/login", limiteLogin, (req, res) => {
    const usuario = String(req.body?.usuario || "");
    const clave = String(req.body?.clave || "");

    const admin = db.prepare(
      "SELECT id, usuario, password_hash FROM administradores WHERE usuario=?"
    ).get(usuario);

    if (!admin || !bcrypt.compareSync(clave, admin.password_hash)) {
      return res.status(401).json({
        ok: false,
        error: "Credenciales incorrectas"
      });
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({ ok: false });
      }

      req.session.adminId = admin.id;

      res.json({
        ok: true,
        usuario: admin.usuario
      });
    });
  });

  app.get("/api/sesion", (req, res) => {
    res.json({
      autenticado: Boolean(req.session.adminId)
    });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("cq.sid");
      res.json({ ok: true });
    });
  });

  return function requiereAdmin(req, res, next) {
    if (!req.session.adminId) {
      return res.status(401).json({
        error: "Acceso no autorizado"
      });
    }
    next();
  };
}

module.exports = configurarAcceso;