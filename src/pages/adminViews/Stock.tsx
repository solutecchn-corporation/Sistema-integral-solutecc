import React, { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";

type InventarioRow = {
  id: string;
  nombre: string;
  sku?: string;
  marca?: string;
  modelo?: string;
  descripcion?: string;
  imagen?: string;
};

export default function Stock() {
  const [sku, setSku] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [rows, setRows] = useState<InventarioRow[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      let query: any = supabase
        .from("inventario")
        .select("id, nombre, sku, marca, modelo, descripcion, imagen");
      if (sku) query = query.ilike("sku", `%${sku}%`);
      if (marca) query = query.ilike("marca", `%${marca}%`);
      if (modelo) query = query.ilike("modelo", `%${modelo}%`);
      // Excluir productos de categoría 'SERVICIOS'
      query = query.not("categoria", "ilike", "%servicios%");
      const { data, error } = await query.order("nombre", { ascending: true });
      if (error) throw error;
      const inv: InventarioRow[] = Array.isArray(data)
        ? (data as InventarioRow[])
        : [];
      setRows(inv);

      // compute stock from registro_de_inventario: sum(ENTRADA) - sum(SALIDA)
      const ids = inv.map((r) => r.id);
      if (ids.length === 0) {
        setStockMap({});
        return;
      }

      // fetch registro_de_inventario rows for these products
      const { data: regData, error: regErr } = await supabase
        .from("registro_de_inventario")
        .select("producto_id, cantidad, tipo_de_movimiento")
        .in("producto_id", ids);
      if (regErr) throw regErr;
      const regRows = Array.isArray(regData) ? regData : [];

      const map: Record<string, number> = {};
      // initialize map
      for (const r of inv) map[String(r.id)] = 0;

      for (const r of regRows) {
        const pid = String((r as any).producto_id);
        const qty = Number((r as any).cantidad) || 0;
        const tipo = String((r as any).tipo_de_movimiento || "").toUpperCase();
        if (!map.hasOwnProperty(pid)) map[pid] = 0;
        if (tipo === "ENTRADA") map[pid] = (map[pid] || 0) + qty;
        else if (tipo === "SALIDA") map[pid] = (map[pid] || 0) - qty;
        else {
          // Unknown movement type: ignore or treat as 0
        }
      }

      // ensure two decimals
      for (const k of Object.keys(map))
        map[k] = Number((map[k] || 0).toFixed(2));
      setStockMap(map);

      // Resolve image URLs for rows
      try {
        const sup = (await import("../../lib/supabaseClient")).default;
        const BUCKET =
          (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string) ||
          "inventario";
        const urlMap: Record<string, string | null> = {};
        await Promise.all(
          inv.map(async (r) => {
            const raw = (r as any).imagen;
            if (!raw) {
              urlMap[String(r.id)] = null;
              return;
            }
            const src = String(raw);
            if (src.startsWith("http")) {
              urlMap[String(r.id)] = src;
              return;
            }
            // check for storage path pattern
            let objectPath = src;
            const m = String(src).match(
              /\/storage\/v1\/object\/public\/([^/]+)\/(.*)/
            );
            if (m) {
              objectPath = decodeURIComponent(m[2]);
            }
            try {
              const publicRes = await sup.storage
                .from(BUCKET)
                .getPublicUrl(objectPath);
              const candidate =
                (publicRes as any)?.data?.publicUrl ||
                (publicRes as any)?.data?.publicURL ||
                null;
              if (candidate) {
                urlMap[String(r.id)] = candidate;
                return;
              }
            } catch (e) {
              // continue to signed url
            }
            try {
              const signed = await sup.storage
                .from(BUCKET)
                .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
              const signedUrl = (signed as any)?.data?.signedUrl ?? null;
              urlMap[String(r.id)] = signedUrl;
            } catch (e) {
              urlMap[String(r.id)] = null;
            }
          })
        );
        setImageUrls(urlMap);
      } catch (e) {
        // ignore image resolution errors
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      setRows([]);
      setStockMap({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Stock</h2>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          className="input"
          placeholder="Filtro Codigo"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
        />
        <input
          className="input"
          placeholder="Filtro Marca"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
        />
        <input
          className="input"
          placeholder="Filtro Modelo"
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
        />
        <button className="btn-opaque" onClick={() => loadRows()}>
          Aplicar
        </button>
        <button
          className="btn-opaque"
          onClick={() => {
            setSku("");
            setMarca("");
            setModelo("");
            loadRows();
          }}
        >
          Limpiar
        </button>
        <div style={{ marginLeft: "auto", color: "#64748b" }}>
          {loading ? "Cargando..." : `${rows.length} productos`}
        </div>
      </div>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ background: "#fff", padding: 12, borderRadius: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div></div>
          <div>
            <button
              className="btn-opaque"
              onClick={() => {
                document.body.classList.add("print-table-only");
                setTimeout(() => {
                  window.print();
                  document.body.classList.remove("print-table-only");
                }, 50);
              }}
            >
              Imprimir tabla
            </button>
          </div>
        </div>

        <div
          style={{
            maxHeight: "65vh",
            overflowY: "auto",
            overflowX: "auto",
            marginTop: 8,
          }}
        >
          <table className="admin-table">
            <thead>
              <tr>
                <th>Imagen</th>
                <th>Codigo</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Descripción</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ width: 70 }}>
                    {imageUrls[String(r.id)] ? (
                      <img
                        src={encodeURI(imageUrls[String(r.id)] as string)}
                        alt={r.nombre}
                        style={{ width: 48, height: 48, objectFit: "cover" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "";
                        }}
                      />
                    ) : r.imagen ? (
                      <img
                        src={r.imagen}
                        alt={r.nombre}
                        style={{ width: 48, height: 48, objectFit: "cover" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "";
                        }}
                      />
                    ) : (
                      ""
                    )}
                  </td>
                  <td>{r.sku || ""}</td>
                  <td>{r.marca || ""}</td>
                  <td>{r.modelo || ""}</td>
                  <td style={{ maxWidth: 320 }}>{r.descripcion || ""}</td>
                  <td style={{ textAlign: "right" }}>
                    {stockMap[String(r.id)] != null
                      ? String(stockMap[String(r.id)])
                      : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
