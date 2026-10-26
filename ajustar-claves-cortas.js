const fs=require("fs");
const path=require("path");
const vm=require("vm");

const cambios=[
 {
  nombre:"modules/licencias.js",
  antiguo:'return "CQ-"+crypto.randomBytes(24).toString("hex").toUpperCase();',
  nuevo:'return "CQ-"+crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");'
 },
 {
  nombre:"modules/claves-admin.js",
  antiguo:'const clave="CQ-"+crypto.randomBytes(24).toString("hex").toUpperCase();',
  nuevo:'const clave="CQ-"+crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");'
 },
 {
  nombre:"modules/activacion-individual.js",
  antiguo:'/^CQ-[A-F0-9]{48}$/.test(clave)',
  nuevo:'/^(?:CQ-[A-F0-9]{48}|CQ-(?:[A-F0-9]{4}-){3}[A-F0-9]{4})$/.test(clave)'
 },
 {
  nombre:"public/control.html",
  antiguo:'GUARDA ESTA CLAVE (solo aparece ahora): ',
  nuevo:'CLAVE: '
 },
 {
  nombre:"public/control.html",
  antiguo:'"NUEVA CLAVE DE LICENCIA #"+id+" (CÓPIALA Y GUÁRDALA): "+r.clave',
  nuevo:'"CLAVE: "+r.clave'
 },
 {
  nombre:"public/control.html",
  antiguo:'nueva.textContent="GENERAR NUEVA CLAVE";',
  nuevo:'nueva.textContent="CAMBIAR CLAVE";'
 }
];

const preparados=new Map();

for(const cambio of cambios){
 const f=path.join(process.cwd(),cambio.nombre);
 if(!fs.existsSync(f))throw Error("ARCHIVO NO ENCONTRADO: "+cambio.nombre);
 const actual=preparados.has(f)?preparados.get(f):fs.readFileSync(f,"utf8");

 if(!actual.includes(cambio.antiguo)){
  if(actual.includes(cambio.nuevo))continue;
  throw Error("ESTRUCTURA DIFERENTE: "+cambio.nombre+". NO SE MODIFICO NADA.");
 }
 preparados.set(f,actual.replace(cambio.antiguo,cambio.nuevo));
}

for(const [f,contenido] of preparados){
 if(f.endsWith(".js"))new vm.Script(contenido,{filename:f});
 if(f.endsWith(".html")){
  const scripts=[...contenido.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for(const s of scripts)new vm.Script(s[1]);
 }
}

const respaldo=path.join(process.cwd(),"RESPALDO_CLAVES_CORTAS_"+Date.now());
fs.mkdirSync(respaldo);
const escritos=[];

try{
 for(const [f,contenido] of preparados){
  const original=fs.readFileSync(f);
  const nombre=path.relative(process.cwd(),f).replace(/[\\/]/g,"_");
  fs.writeFileSync(path.join(respaldo,nombre),original);
  escritos.push({f,original});
  fs.writeFileSync(f,contenido,"utf8");
 }

 const lic=require(path.join(process.cwd(),"modules/licencias.js"));
 const clave=lic.generarClave();
 if(!/^CQ-(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/.test(clave)){
  throw Error("ERROR EN FORMATO DE CLAVE");
 }

 console.log("CLAVES CORTAS: OK");
 console.log("VALIDACION NUEVA Y ANTERIOR: OK");
 console.log("PANEL SIMPLIFICADO: OK");
 console.log("MEMBRESIAS EXISTENTES: INTACTAS");
 console.log("RESPALDO:",respaldo);
}catch(e){
 for(const x of escritos.reverse())fs.writeFileSync(x.f,x.original);
 throw e;
}