
"use strict";

const esquema = {
  "tablas": [
    {
      "name": "administradores",
      "sql": "CREATE TABLE administradores (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    usuario TEXT UNIQUE NOT NULL,\n    password_hash TEXT NOT NULL\n  )"
    },
    {
      "name": "clientes",
      "sql": "CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,email TEXT,creado_en TEXT DEFAULT CURRENT_TIMESTAMP)"
    },
    {
      "name": "cq_claves_fichas",
      "sql": "CREATE TABLE cq_claves_fichas(licencia_id INTEGER PRIMARY KEY,cifrado TEXT NOT NULL)"
    },
    {
      "name": "instalaciones_licencia",
      "sql": "CREATE TABLE instalaciones_licencia(\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  licencia_id INTEGER NOT NULL,\n  dispositivo_id TEXT NOT NULL,\n  creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(licencia_id,dispositivo_id)\n )"
    },
    {
      "name": "licencias",
      "sql": "CREATE TABLE licencias (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER NOT NULL,producto_id INTEGER NOT NULL,estado TEXT NOT NULL DEFAULT 'PAUSADA',vence_en TEXT,creado_en TEXT DEFAULT CURRENT_TIMESTAMP, producto_codigo TEXT, clave_hash TEXT, dispositivo_id TEXT, max_perfiles INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(cliente_id) REFERENCES clientes(id),FOREIGN KEY(producto_id) REFERENCES productos(id))"
    },
    {
      "name": "productos",
      "sql": "CREATE TABLE productos (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT UNIQUE NOT NULL,nombre TEXT NOT NULL,creado_en TEXT DEFAULT CURRENT_TIMESTAMP)"
    }
  ],
  "indices": [
    {
      "name": "idx_instalaciones_licencia",
      "sql": "CREATE INDEX idx_instalaciones_licencia\n ON instalaciones_licencia(licencia_id)"
    }
  ],
  "columnas": {
    "administradores": [
      {
        "name": "id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "usuario",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "password_hash",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      }
    ],
    "clientes": [
      {
        "name": "id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "nombre",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "email",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "creado_en",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": "CURRENT_TIMESTAMP",
        "pk": 0
      }
    ],
    "cq_claves_fichas": [
      {
        "name": "licencia_id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "cifrado",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      }
    ],
    "instalaciones_licencia": [
      {
        "name": "id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "licencia_id",
        "type": "INTEGER",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "dispositivo_id",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "creado_en",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": "CURRENT_TIMESTAMP",
        "pk": 0
      }
    ],
    "licencias": [
      {
        "name": "id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "cliente_id",
        "type": "INTEGER",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "producto_id",
        "type": "INTEGER",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "estado",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": "'PAUSADA'",
        "pk": 0
      },
      {
        "name": "vence_en",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "creado_en",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": "CURRENT_TIMESTAMP",
        "pk": 0
      },
      {
        "name": "producto_codigo",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "clave_hash",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "dispositivo_id",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "max_perfiles",
        "type": "INTEGER",
        "notnull": 1,
        "dflt_value": "1",
        "pk": 0
      }
    ],
    "productos": [
      {
        "name": "id",
        "type": "INTEGER",
        "notnull": 0,
        "dflt_value": null,
        "pk": 1
      },
      {
        "name": "codigo",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "nombre",
        "type": "TEXT",
        "notnull": 1,
        "dflt_value": null,
        "pk": 0
      },
      {
        "name": "creado_en",
        "type": "TEXT",
        "notnull": 0,
        "dflt_value": "CURRENT_TIMESTAMP",
        "pk": 0
      }
    ]
  }
};

function quote(n) {
  return '"' + n.replace(/"/g,'""') + '"';
}

module.exports = function sincronizarEsquema(db) {

  const ejecutar = db.transaction(() => {

    for (const t of esquema.tablas) {
      const existe = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
      ).get(t.name);

      if (!existe) {
        const sql = t.sql.replace(
          /^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i,
          "CREATE TABLE IF NOT EXISTS "
        );
        db.exec(sql);
      }
    }

    for (const [tabla,columnas] of Object.entries(esquema.columnas)) {
      const existentes = new Set(
        db.prepare("PRAGMA table_info("+quote(tabla)+")")
          .all().map(c=>c.name)
      );

      for (const c of columnas) {
        if (existentes.has(c.name)) continue;

        if (c.pk || (c.notnull && c.dflt_value===null)) {
          throw new Error(
            "Migracion manual necesaria: "+tabla+"."+c.name
          );
        }

        let sql = "ALTER TABLE "+quote(tabla)+
                  " ADD COLUMN "+quote(c.name)+
                  " "+(c.type||"TEXT");

        if (c.dflt_value!==null) {
          sql += " DEFAULT "+c.dflt_value;
        }

        if (c.notnull) sql += " NOT NULL";

        db.exec(sql);
      }
    }

    for (const i of esquema.indices) {
      const sql = i.sql.replace(
        /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
        "CREATE $1INDEX IF NOT EXISTS "
      );
      db.exec(sql);
    }
  });

  ejecutar();

  console.log("CQ CONTROL: ESQUEMA SQLITE VERIFICADO");
};
