(() => {
  const productos = [
    ["PANENEL2 TELEGRAM UN POST", "PANENEL2_TELEGRAM_UN_POST"],
    ["PANAL2 TELEGRAM DOS POST", "PANAL2_TELEGRAM_DOS_POST"]
  ];

  function agregar() {
    document.querySelectorAll("select").forEach(lista => {
      const esProductos = Array.from(lista.options).some(o =>
        o.value.startsWith("LOBO_PRO_") ||
        o.value.startsWith("PANEL3_TELEGRAM_")
      );

      if (!esProductos) return;

      productos.forEach(([nombre, id]) => {
        if (!Array.from(lista.options).some(o => o.value === id)) {
          lista.add(new Option(nombre, id));
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", agregar);
  agregar();
})();