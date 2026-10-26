"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db){

 const hash=s=>crypto.createHash("sha256")
  .update(s).digest("hex");

 app.post("/api/licencias/activar-instalacion",(req,res)=>{
  res.set("Cache-Control","no-store");

  try{
   const clave=String(req.body?.clave||"").trim();
   const p=String(req.body?.producto||"");
   const dispositivo=String(req.body?.dispositivo||"");

   if(!/^CQ-(?:[A-F0-9]{48}|(?:[A-F0-9]{4}-){3}[A-F0-9]{4})$/.test(clave)||
      p!=="LOBO_PRO_1"||
      !/^[a-f0-9-]{36}$/i.test(dispositivo))
    return res.status(400).json({
     autorizada:false,motivo:"datos_invalidos"
    });

   const l=db.prepare(`
    SELECT l.id,l.producto_codigo,l.estado,l.vence_en,
           l.max_perfiles,c.nombre AS cliente
    FROM licencias l
    JOIN clientes c ON c.id=l.cliente_id
    WHERE l.clave_hash=?
   `).get(hash(clave));

   if(!l||l.producto_codigo!==p)
    return res.status(403).json({
     autorizada:false,motivo:"licencia_invalida"
    });

   if(String(l.estado).toUpperCase()!=="ACTIVA")
    return res.status(403).json({
     autorizada:false,motivo:"licencia_suspendida"
    });

   if(!Number.isFinite(Date.parse(l.vence_en))||
      Date.parse(l.vence_en)<=Date.now())
    return res.status(403).json({
     autorizada:false,motivo:"licencia_vencida"
    });

   const registrar=db.transaction(()=>{
    const existe=db.prepare(`
     SELECT id FROM instalaciones_licencia
     WHERE licencia_id=? AND dispositivo_id=?
    `).get(l.id,dispositivo);

    if(existe)return true;

    const total=db.prepare(`
     SELECT COUNT(*) AS total FROM instalaciones_licencia
     WHERE licencia_id=?
    `).get(l.id).total;

    if(total>=l.max_perfiles)return false;

    db.prepare(`
     INSERT INTO instalaciones_licencia(licencia_id,dispositivo_id)
     VALUES(?,?)
    `).run(l.id,dispositivo);

    return true;
   });

   if(!registrar())
    return res.status(403).json({
     autorizada:false,motivo:"limite_perfiles_alcanzado"
    });

   return res.json({
    autorizada:true,
    cliente:l.cliente,
    vence_en:l.vence_en
   });

  }catch(e){
   console.error("Activacion:",e.message);
   return res.status(500).json({
    autorizada:false,motivo:"error_servidor"
   });
  }
 });
};