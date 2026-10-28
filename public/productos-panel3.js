(function () {
  function agregarProductos() {
    const opciones = [
      ['PANEL3 TELEGRAM CLIENTE UN POST', 'PANEL3_TELEGRAM_CLIENTE_1'],
      ['PANEL3 TELEGRAM CLIENTE DOS POSTS', 'PANEL3_TELEGRAM_CLIENTE_2']
    ];

    document.querySelectorAll('select').forEach(lista => {
      if (![...lista.options].some(x => x.value === 'LOBO_PRO_1')) return;

      opciones.forEach(([nombre, valor]) => {
        if (![...lista.options].some(x => x.value === valor)) {
          lista.add(new Option(nombre, valor));
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', agregarProductos);
})();
