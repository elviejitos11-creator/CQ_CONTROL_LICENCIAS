"use strict";
const crypto=require("node:crypto");

const PRODUCTOS={
  LOBO_PRO_1:"LOBO PRO 1",
  LOBO_PRO_2:"LOBO PRO 2",
  LOBO_PRO_1_NORMAL: "LOBO_PRO_1_NORMAL",
  LOBO_PRO_2_NORMAL: "LOBO_PRO_2_NORMAL",
  PANEL3_TELEGRAM_CLIENTE_1: "PANEL3_TELEGRAM_CLIENTE_1",
  PANEL3_TELEGRAM_CLIENTE_2: "PANEL3_TELEGRAM_CLIENTE_2"
};

function prepararLicencias(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS licencias(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      producto_codigo TEXT NOT NULL,
      clave_hash TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL DEFAULT 'activa',
      dispositivo_id TEXT,
      vence_en TEXT NOT NULL,
      creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function generarClave(){
  return "CQ-"+crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");
}

function hashClave(clave){
  return crypto.createHash("sha256").update(String(clave)).digest("hex");
}

function validarLicencia(db,datos){
  const clave=String(datos.clave||"");
  const producto=String(datos.producto||"");
  const dispositivo=String(datos.dispositivo||"");

  if(!clave||!PRODUCTOS[producto]||!dispositivo){
    return {autorizada:false,motivo:"datos_invalidos"};
  }

  const licencia=db.prepare(
    "SELECT id,producto_codigo,estado,dispositivo_id,vence_en FROM licencias WHERE clave_hash=?"
  ).get(hashClave(clave));

  if(!licencia||licencia.producto_codigo!==producto){
    return {autorizada:false,motivo:"licencia_invalida"};
  }

  if(String(licencia.estado).toUpperCase()!=="ACTIVA"){
    return {autorizada:false,motivo:"licencia_suspendida"};
  }

  const vence=Date.parse(licencia.vence_en);
  if(!Number.isFinite(vence)||vence<=Date.now()){
    return {autorizada:false,motivo:"licencia_vencida"};
  }



  
 const registro=db.prepare(
  "SELECT id FROM instalaciones_licencia WHERE licencia_id=? AND dispositivo_id=?"
 ).get(licencia.id,dispositivo);
 if(!registro)
  return {autorizada:false,motivo:"instalacion_no_autorizada"};
 return {autorizada:true,licencia_id:licencia.id,vence_en:licencia.vence_en};
 
}

module.exports={PRODUCTOS,prepararLicencias,generarClave,hashClave,validarLicencia};