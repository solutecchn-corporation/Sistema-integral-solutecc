import React, { useEffect, useState } from "react";
import { formatMoney } from "../lib/formatMoney";
import supabase from "../lib/supabaseClient";

type DetalleRow = {
  id: number | string;
  compra_id: number | string;
  producto_id: string;
  cantidad: number;
  costo_unitario: number;
  subtotal?: number;
};

type Producto = { id: string; nombre: string };

export default function CompraDetailModal({
  open,
  compraId,
  onClose,
}: {
  open: boolean;
  compraId: number | string | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<DetalleRow[]>([]);
  const [productosMap, setProductosMap] = useState<Record<string, Producto>>(
    {},
  );
  const [exentoMap, setExentoMap] = useState<Record<string, boolean>>({});
  const [impuestoVal, setImpuestoVal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || compraId == null) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("compras_detalle")
          .select(
            "id, compra_id, producto_id, cantidad, costo_unitario, subtotal",
          )
          .eq("compra_id", compraId);
        if (error) throw error;
        const detalles: DetalleRow[] = Array.isArray(data)
          ? (data as DetalleRow[])
          : [];
        if (!mounted) return;
        setRows(detalles);

        const productoIds = Array.from(
          new Set(detalles.map((d) => d.producto_id)),
        ).filter(Boolean);
        if (productoIds.length > 0) {
          const { data: prods } = await supabase
            .from("inventario")
            .select("id, nombre, exento")
            .in("id", productoIds);
          const map: Record<string, Producto> = {};
          const exmap: Record<string, boolean> = {};
          if (Array.isArray(prods))
            prods.forEach((p: any) => {
              map[String(p.id)] = { id: p.id, nombre: p.nombre };
              exmap[String(p.id)] =
                p.exento === true ||
                p.exento === 1 ||
                String(p.exento).toLowerCase() === "true";
            });
          if (mounted) {
            setProductosMap(map);
            setExentoMap(exmap);
          }
        } else {
          setProductosMap({});
        }
        // load impuesto (tasa)
        try {
          const { data: impData } = await supabase
            .from("impuesto")
            .select("impuesto_venta")
            .limit(1)
            .order("id", { ascending: true });
          const impuestoRow =
            Array.isArray(impData) && impData.length > 0 ? impData[0] : null;
          const impuestoNumber = impuestoRow
            ? Number(impuestoRow.impuesto_venta)
            : 0;
          if (mounted) setImpuestoVal(impuestoNumber);
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.error("Error cargando detalle de compra", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, compraId]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          width: 760,
          maxWidth: "98%",
          background: "#fff",
          borderRadius: 8,
          padding: 16,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Detalle de compra {compraId}</h3>

        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div>Cargando...</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Costo unit.</th>
                  <th>Impuesto</th>
                  <th>Subtotal</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cantidad = Number(r.cantidad);
                  const costo = Number(r.costo_unitario);
                  const totalLine = cantidad * costo;
                  const tasa =
                    impuestoVal > 1 ? impuestoVal / 100 : impuestoVal;
                  const isExento = exentoMap[String(r.producto_id)] === true;
                  const impuestoLine = isExento ? 0 : totalLine * tasa;
                  const subtotalLine = isExento
                    ? totalLine
                    : totalLine - impuestoLine;
                  return (
                    <tr key={String(r.id)}>
                      <td>
                        {productosMap[String(r.producto_id)]
                          ? productosMap[String(r.producto_id)].nombre
                          : String(r.producto_id)}
                      </td>
                      <td>{cantidad.toFixed(2)}</td>
                      <td>{formatMoney(costo)}</td>
                      <td>{formatMoney(impuestoLine)}</td>
                      <td>{formatMoney(subtotalLine)}</td>
                      <td>{formatMoney(totalLine)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {rows.length > 0 &&
                  (() => {
                    const totals = rows.reduce(
                      (acc, r) => {
                        const cantidad = Number(r.cantidad);
                        const costo = Number(r.costo_unitario);
                        const lineTotal = cantidad * costo;
                        const tasa =
                          impuestoVal > 1 ? impuestoVal / 100 : impuestoVal;
                        const isExento =
                          exentoMap[String(r.producto_id)] === true;
                        const impuestoLine = isExento ? 0 : lineTotal * tasa;
                        const subtotalLine = isExento
                          ? lineTotal
                          : lineTotal - impuestoLine;
                        acc.subtotal += subtotalLine;
                        acc.impuesto += impuestoLine;
                        acc.total += lineTotal;
                        return acc;
                      },
                      { subtotal: 0, impuesto: 0, total: 0 },
                    );
                    return (
                      <tr>
                        <td colSpan={3} style={{ textAlign: "right" }}>
                          Totales:
                        </td>
                        <td>{formatMoney(totals.impuesto)}</td>
                        <td>{formatMoney(totals.subtotal)}</td>
                        <td>{formatMoney(totals.total)}</td>
                      </tr>
                    );
                  })()}
              </tfoot>
            </table>
          )}
        </div>

        <div
          style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
        >
          <button className="btn-opaque" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
