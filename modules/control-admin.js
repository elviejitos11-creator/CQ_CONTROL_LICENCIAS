"use strict";
const crypto = require("node:crypto");
const lic = require("./licencias");

module.exports = function(app, db, requiereAdmin) {

  app.post("/api/control/clientes", requiereAdmin, (req,res)=>{
    try {
      const nombre=String(req.body?.nombre||"").trim();
      const email=String(req.body?.email||"").trim();

      if(!nombre || nombre.length>100 || email.length>200)
        return res.status(400).json({error:"Datos invalidos"});

      const r=db.prepare(
        "INSERT INTO clientes(nombre,email) VALUES(?,?)"
      ).run(nombre,email);

      
      const max=Number(req.body?.max_perfiles ?? 1);
      if(!Number.isInteger(max)||max<1||max>10000){
       return res.status(400).json({error:"Limite invalido"});
      }
      db.prepare("UPDATE licencias SET max_perfiles=? WHERE id=?")
        .run(max,Number(r.lastInsertRowid));
      res.status(201).json({
 ok:true,id:Number(r.lastInsertRowid)});
    } catch(e) {
      res.status(500).json({error:"No se pudo crear el cliente"});
    }
  });

  app.post("/api/control/crear-licencia", requiereAdmin, (req,res)=>{
    try {
      const cliente=Number(req.body?.cliente_id);
      const producto=String(req.body?.producto_codigo||"");
      const dias=Number(req.body?.dias);

      if(!Number.isSafeInteger(cliente) || cliente<=0 ||
         !["LOBO_PRO_1","LOBO_PRO_2"].includes(producto) ||
         !Number.isInteger(dias) || dias<1 || dias>365)
        return res.status(400).json({error:"Datos invalidos"});

      const c=db.prepare("SELECT id FROM clientes WHERE id=?").get(cliente);
      const p=db.prepare("SELECT id FROM productos WHERE codigo=?").get(producto);

      if(!c || !p)
        return res.status(404).json({error:"Cliente o producto no existe"});

      const clave=lic.generarClave();
      const vence=new Date(Date.now()+dias*86400000).toISOString();

      const r=db.prepare(
        "INSERT INTO licencias(cliente_id,producto_id,producto_codigo,clave_hash,estado,vence_en) VALUES(?,?,?,?,'ACTIVA',?)"
      ).run(cliente,p.id,producto,lic.hashClave(clave),vence);

      res.status(201).json({
        ok:true,
        id:Number(r.lastInsertRowid),
        clave,
        vence_en:vence
      });
    } catch(e) {
      res.status(500).json({error:"No se pudo crear la licencia"});
    }
  });

  app.get("/api/control/resumen", requiereAdmin, (req,res)=>{
    try {
      const datos=db.prepare(`
        SELECT l.id, l.cliente_id, c.nombre AS cliente,
               l.producto_codigo AS producto,
               l.estado, l.vence_en
        FROM licencias l
        JOIN clientes c ON c.id=l.cliente_id
        ORDER BY l.id DESC
      `).all();
      res.json(datos);
    }catch(e){
      res.status(500).json({error:"Error consultando licencias"});
    }
  });
};
