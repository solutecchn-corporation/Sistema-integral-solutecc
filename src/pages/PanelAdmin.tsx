import React, { useState, useMemo } from "react";
// Importamos el menú desde el archivo de datos
import { getFilteredMenuItems } from "../data/menuItems";
import Placeholder from "./Placeholder"; // Asumiendo que el componente Placeholder existe

// Importar todos los componentes de vista para el renderizado
import Dashboard from "./adminViews/Dashboard";
import DatosEmpresa from "./adminViews/DatosEmpresa";
import UsuariosCajeros from "./UsuariosCajeros";
import UsuariosWeb from "./adminViews/UsuariosWeb";
import PedidosWeb from "./adminViews/PedidosWeb";
import CAI from "./adminViews/CAI";
import Facturas from "./adminViews/Facturas";
// HistorialFacturas view intentionally removed from menu; component kept as stub
import HistorialFacturas from "./adminViews/HistorialFacturas";
import NotasCreditoView from "./adminViews/NotasCredito";
import InventarioTable from "./adminViews/InventarioTable";
import Precios from "./adminViews/Precios";
import PreciosHistorico from "./adminViews/PreciosHistorico";
import Stock from "./adminViews/Stock";
import EntradasSalidas from "./adminViews/EntradasSalidas";
import AnulacionFactura from "./adminViews/AnulacionFactura";
import SesionesCaja from "./adminViews/SesionesCaja";
import MovimientosCaja from "./adminViews/MovimientosCaja";
// ... otros imports de Compras, Pedidos, Cotizaciones, Reportes, Contaduría
import RepVentas from "./adminViews/RepVentas";
import RepDevoluciones from "./adminViews/RepDevoluciones";
import RepIngresosEgresos from "./adminViews/RepIngresosEgresos";
import RepCompras from "./adminViews/RepCompras";
import RepInventario from "./adminViews/RepInventario";
import RepExport from "./adminViews/RepExport";
import CuentasContables from "./adminViews/CuentasContables";
import LibroDiario from "./adminViews/LibroDiario";
import LibroMayor from "./adminViews/LibroMayor";
import BalanceGeneral from "./adminViews/BalanceGeneral";
import EstadoResultados from "./adminViews/EstadoResultados";
import Auditoria from "./adminViews/Auditoria";
import CAIView from "./adminViews/CAI";
import Proveedores from "./adminViews/Proveedores";
import Clientes from "./adminViews/Clientes";
import ComprasMain from "./adminViews/ComprasMain";
import DevolucionesProveedores from "./adminViews/DevolucionesProveedores";
import Impuestos from "./adminViews/Impuestos";
import RegistroProducto from "./adminViews/RegistroProducto";
import Cotizaciones from "./adminViews/Cotizaciones";
import PromocionesDescuento from "./adminViews/PromocionesDescuento";
import DevolucionesAdmin from "./adminViews/DevolucionesAdmin";
import BannersPromocionales from "./adminViews/BannersPromocionales";

// Mapeo de IDs de menú a componentes para renderizado dinámico
// Se utiliza useMemo para que este objeto no se recree en cada render si no es necesario
const VIEW_COMPONENTS: Record<string, React.FC<any>> = {
  dashboard: Dashboard,
  datos: DatosEmpresa,
  usuarios_internal: UsuariosCajeros,
  usuarios_web: UsuariosWeb,
  pedidos_web: PedidosWeb,
  cai: CAIView,
  facturas: Facturas,

  inventario_productos: InventarioTable,
  registro_producto: RegistroProducto,
  precios_productos: Precios,
  precios_historico: PreciosHistorico,
  stock: Stock,
  inventario_salidas: EntradasSalidas,

  proveedores: Proveedores,
  clientes: Clientes,
  // ... (Añadir el resto de mapeos de sub_id a componentes)
  caja_sesiones: SesionesCaja,
  caja_movimientos: MovimientosCaja,
  rep_ventas: RepVentas,
  rep_devoluciones: RepDevoluciones,
  rep_ingresos_egresos: RepIngresosEgresos,
  rep_compras: RepCompras,
  rep_inventario: RepInventario,
  compras_main: ComprasMain,
  devoluciones_proveedores: DevolucionesProveedores,
  rep_export: RepExport,
  cuentas_contables: CuentasContables,
  libro_diario: LibroDiario,
  libro_mayor: LibroMayor,
  balance_general: BalanceGeneral,
  estado_resultados: EstadoResultados,
  auditoria: Auditoria,
  impuestos: Impuestos,
  notas_credito: NotasCreditoView,
  anulacion_factura: AnulacionFactura,
  devoluciones_admin: DevolucionesAdmin,
  cotizaciones: Cotizaciones,
  promociones_descuento: PromocionesDescuento,
  banners_promocionales: BannersPromocionales,
  // Para los que solo tienen una sub-opción, podemos mapear el parent-id al componente por defecto si es necesario
  // o confiar en el placeholder si el subActive no está definido.
};

export default function PanelAdmin({ onLogout }: { onLogout: () => void }) {
  // Get filtered menu items based on web integration setting
  const menuItems = useMemo(() => getFilteredMenuItems(), []);

  // Solo el estado de navegación es necesario en el componente principal
  const [active, setActive] = useState("dashboard");
  const [subActive, setSubActive] = useState<string | null>(null);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    {},
  );

  // Lógica para determinar el ID de la vista actual (subActive tiene prioridad)
  const currentViewId = subActive || active;
  const CurrentViewComponent = VIEW_COMPONENTS[currentViewId];

  // Determinar el título para el placeholder o la vista
  const getTitleForView = (id: string) => {
    // Buscar la etiqueta del elemento de menú, ya sea padre o hijo
    for (const parent of menuItems) {
      if (parent.id === id) return parent.label;
      if (parent.children) {
        const child = parent.children.find(
          (c: { id: string; label?: string }) => c.id === id,
        );
        if (child) return child.label;
      }
    }
    return "Panel de Administración";
  };

  const currentTitle = getTitleForView(currentViewId);

  // Lógica del menú (comportamiento acordeón: solo un submenú abierto)
  const handleMenuClick = (mi: (typeof menuItems)[0]) => {
    if (mi.id === "salir") return onLogout();
    if (mi.children && mi.children.length > 0) {
      // Mantener solo un submenú abierto: cerrar los demás
      setExpandedMenus((s) => {
        const isOpen = !!s[mi.id];
        return { [mi.id]: !isOpen } as Record<string, boolean>;
      });

      // Si abrimos el menú, navegar al primer hijo por defecto
      if (!expandedMenus[mi.id]) {
        setActive(mi.id);
        setSubActive(mi.children[0].id);
      }
      // Al cerrar el acordeón, NO limpiar subActive para que la vista activa siga visible
    } else {
      // Navegación directa para menús sin hijos
      setActive(mi.id);
      setSubActive(null);
      // cerrar todos los submenús al navegar a una vista directa
      setExpandedMenus({});
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc" }}>
      <aside
        style={{
          width: 300,
          minWidth: 220,
          maxWidth: 380,
          background: "#0f1724",
          color: "white",
          padding: 20,
          boxShadow: "2px 0 6px rgba(2,6,23,0.08)",
          transition: "width 180ms ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <strong>Panel Admin</strong>
          <button
            onClick={onLogout}
            className="btn-opaque"
            style={{ background: "#ef4444", padding: "6px 8px" }}
          >
            Salir
          </button>
        </div>

        <nav>
          {menuItems.map((mi) => (
            <div key={mi.id} style={{ marginBottom: 6 }}>
              {/* Parent item */}
              <div
                onClick={() => handleMenuClick(mi)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 8px",
                  borderRadius: 6,
                  cursor: "pointer",
                  background:
                    active === mi.id && !subActive
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                }}
              >
                <span>{mi.label}</span>
                {Array.isArray(mi.children) && mi.children.length > 0 ? (
                  <span style={{ marginLeft: 8 }}>
                    {expandedMenus[mi.id] ? "▾" : "▸"}
                  </span>
                ) : null}
              </div>

              {/* Children (expandable) */}
              {Array.isArray(mi.children) &&
                mi.children.length > 0 &&
                expandedMenus[mi.id] && (
                  <div style={{ marginLeft: 12, marginTop: 6 }}>
                    {mi.children.map((ch: { id: string; label?: string }) => (
                      <div
                        key={ch.id}
                        onClick={() => {
                          setActive(mi.id);
                          setSubActive(ch.id);
                        }}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          marginBottom: 4,
                          fontSize: 13,
                          color: subActive === ch.id ? "#e2e8f0" : "#cbd5e1",
                          background:
                            subActive === ch.id
                              ? "rgba(255,255,255,0.04)"
                              : "transparent",
                        }}
                      >
                        {ch.label}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>
        {CurrentViewComponent ? (
          // Renderiza el componente de vista mapeado
          <CurrentViewComponent />
        ) : (
          // Placeholder para vistas no implementadas o menús con sub-opciones no seleccionadas
          <Placeholder title={currentTitle}>
            {active === currentViewId
              ? "Seleccione una opción del submenú para ver la sección correspondiente."
              : "Contenido no implementado o en construcción."}
          </Placeholder>
        )}
      </main>
    </div>
  );
}
