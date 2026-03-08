// Function to get menu items
export function getFilteredMenuItems(): any[] {
  const allMenuItems: any[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "datos", label: "Datos de mi empresa" },
    {
      id: "usuarios",
      label: "Usuarios / Cajeros",
      children: [
        { id: "usuarios_internal", label: "Usuarios Cajeros" },
        { id: "clientes", label: "Clientes Jurídicos" },
      ],
    },
    {
      id: "factura",
      label: "Factura y CAI",
      children: [
        { id: "cai", label: "Gestio de CAI por cajas" },
        { id: "facturas", label: "Facturas (ventas)" },
        { id: "cotizaciones", label: "Cotizaciones (cotizaciones)" },
        { id: "anulacion_factura", label: "Anulación de factura" },
        { id: "notas_credito", label: "Notas de crédito" },

        { id: "impuestos", label: "Impuestos" },
      ],
    },
    {
      id: "inventario",
      label: "Inventario",
      children: [
        { id: "inventario_productos", label: "Productos (Inventario)" },
        { id: "registro_producto", label: "Registro de producto" },
        { id: "precios_productos", label: "Precios de productos" },
        { id: "precios_historico", label: "Histórico de precios" },
        { id: "stock", label: "Stock" },
        { id: "inventario_salidas", label: "Movimiento de Inventario" },
      ],
    },
    {
      id: "compras",
      label: "Compras y Proveedores",
      children: [
        { id: "compras_main", label: "Compras (compras)" },

        { id: "proveedores", label: "Proveedores (proveedores)" },
        { id: "devoluciones_proveedores", label: "Devolución a Proveedores" },
      ],
    },
    {
      id: "cierres",
      label: "Cierres de caja",
      children: [
        { id: "caja_sesiones", label: "Sesiones de caja (caja_sesiones)" },
        {
          id: "caja_movimientos",
          label: "Movimientos de caja (caja_movimientos)",
        },
      ],
    },
    {
      id: "gestion_web",
      label: "Gestión página web",
      children: [
        { id: "usuarios_web", label: "Usuarios web" },
        { id: "pedidos_web", label: "Pedidos web / Ecommerce" },
      ],
    },
    {
      // Submenu removed; items moved under 'factura'

      id: "reportes",
      label: "Reportes",
      children: [
        { id: "rep_ventas", label: "Ventas (ventas + ventas_detalle)" },
        { id: "rep_devoluciones", label: "Devoluciones (devoluciones_ventas)" },
        {
          id: "rep_ingresos_egresos",
          label: "Ingresos / Egresos (caja_movimientos)",
        },
        { id: "rep_compras", label: "Compras" },
        { id: "rep_inventario", label: "Inventario" },
      ],
    },
    {
      id: "contaduria",
      label: "Contaduría / Libro Diario",
      children: [
        { id: "cuentas_contables", label: "Cuentas contables" },
        { id: "libro_diario", label: "Libro diario" },
        { id: "libro_mayor", label: "Libro mayor" },
        { id: "balance_general", label: "Balance general" },
        { id: "estado_resultados", label: "Estado de resultados" },
      ],
    },
    { id: "salir", label: "Salir" },
  ];

  return allMenuItems;
}

// Export static menu for backward compatibility
export const menuItems = getFilteredMenuItems();

export default menuItems;
