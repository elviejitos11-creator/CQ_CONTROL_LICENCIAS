"use strict";
const crypto=require("node:crypto");

module.exports=function(app,db,requiereAdmin){
 app.post("/api/control/licencias/:id/nueva-clave",requiereAdmin,(req,res)=>{
  try{
   const id=Number(req.params.id);
   if(!Number.isSafeInteger(id)||id<1)
    return res.status(400).json({error:"ID invalido"});

   const l=db.prepare("SELECT id FROM licencias WHERE id=?").get(id);
   if(!l)return res.status(404).json({error:"Licencia no encontrada"});

   const clave="CQ-"+crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");
   const hash=crypto.createHash("sha256").update(clave).digest("hex");

   db.prepare(
    "UPDATE licencias SET clave_hash=?,dispositivo_id=NULL WHERE id=?"
   ).run(hash,id);

   res.set("Cache-Control","no-store");
   res.json({ok:true,id,clave});
  }catch(e){
   console.error("Nueva clave:",e.message);
   res.status(500).json({error:"No se pudo generar la clave"});
  }
 });
};