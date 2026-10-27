const express=require("express"); const path=require("path"); const app=express();
app.set("trust proxy",1); const PORT=process.env.PORT||3000; app.use(express.json());  app.get("/api/health",(req,res)=>res.json({ok:true,nombre:"CQ CONTROL",estado:"SERVIDOR ACTIVO"})); const Database=require("better-sqlite3");
const fsCQ = require("fs");
const cpCQ = require("child_process");
const rutaCQ = path.join(__dirname,"data");
const archivoCQ = path.join(rutaCQ,"cq_control.db");

fsCQ.mkdirSync(rutaCQ,{recursive:true});

let iniciarCQ = !fsCQ.existsSync(archivoCQ);

if (!iniciarCQ) {
  const revisionCQ = new Database(archivoCQ,{readonly:true});
  try {
    for (const tablaCQ of ["clientes","productos","licencias"]) {
      const existeCQ = revisionCQ.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tablaCQ);
      if (!existeCQ) iniciarCQ = true;
    }
  } finally {
    revisionCQ.close();
  }
}

if (iniciarCQ) {
  cpCQ.execFileSync(process.execPath,
    [path.join(__dirname,"setup-db.js")],
    {cwd:__dirname,stdio:"inherit"});
}
 const db=new Database(path.join(__dirname,"data","cq_control.db")); const configurarAcceso=require("./modules/auth"); const requiereAdmin=configurarAcceso(app,db);require("./modules/activacion-normal-2")(app,db);require("./modules/activacion-normal-1")(app,db);require("./modules/fichas-clientes")(app,db,requiereAdmin);require("./modules/limites-perfiles")(app,db,requiereAdmin);require("./modules/borrar-licencias")(app,db,requiereAdmin);require("./modules/activacion-lobo2")(app,db);require("./modules/claves-admin")(app,db,requiereAdmin);require("./modules/activacion-individual")(app,db);require("./modules/control-admin")(app,db,requiereAdmin);require("./modules/licencias-api")(app,db,requiereAdmin);app.use((req,res,next)=>{if(req.path==="/"||req.path==="/index.html"){if(!req.session||!req.session.adminId)return res.redirect("/login.html");}next();});app.use(express.static(path.join(__dirname,"public"))); app.get("/api/productos",(req,res)=>{try{res.json(db.prepare("SELECT id,codigo,nombre,creado_en FROM productos ORDER BY id").all())}catch(e){res.status(500).json({error:"Error consultando productos"})}}); app.get("/api/clientes",requiereAdmin,(req,res)=>{try{res.json(db.prepare("SELECT id,nombre,email,creado_en FROM clientes ORDER BY id DESC").all())}catch(e){res.status(500).json({error:"Error consultando clientes"})}}); app.listen(PORT,"0.0.0.0",()=>console.log("CQ CONTROL INICIADO: http://127.0.0.1:"+PORT));