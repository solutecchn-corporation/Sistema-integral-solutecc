import React, { useEffect, useState } from "react";
import SupabaseTable from "../../components/SupabaseTable";

export default function InventarioTable() {
  const [summary, setSummary] = useState<{
    categorias: number;
    marcas: number;
    items: number;
    productos: number;
    servicios: number;
    publicadas: number;
    exentos: number;
    aplica_impuesto_18: number;
    aplica_impuesto_turistico: number;
  } | null>(null);
  const [selectedCategoria, setSelectedCategoria] = useState<string | "">("");
  const [selectedMarca, setSelectedMarca] = useState<string | "">("");
  const [categoriasList, setCategoriasList] = useState<string[]>([]);
  const [marcasList, setMarcasList] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const sup = (await import("../../lib/supabaseClient")).default;
        // fetch relevant fields and compute counts client-side
        const res = await sup
          .from("inventario")
          .select(
            "id,categoria,marca,publicacion_web,exento,aplica_impuesto_18,aplica_impuesto_turistico,tipo"
          );
        if (!mounted) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        const categoriasSet = new Set(
          rows.map((r: any) => r.categoria ?? "").filter(Boolean)
        );
        const marcasSet = new Set(
          rows.map((r: any) => r.marca ?? "").filter(Boolean)
        );
        const items = rows.length;
        const productos = rows.filter(
          (r: any) => (r.tipo || "producto") === "producto"
        ).length;
        const servicios = rows.filter((r: any) => r.tipo === "servicio").length;
        const publicadas = rows.filter((r: any) =>
          Boolean(r.publicacion_web)
        ).length;
        const isExento = (v: any) => {
          if (v == null) return false;
          if (typeof v === "boolean") return v === true;
          if (typeof v === "number") return v === 1;
          const s = String(v).toLowerCase().trim();
          return (
            s === "1" ||
            s === "true" ||
            s === "t" ||
            s === "si" ||
            s === "s" ||
            s === "yes"
          );
        };
        const exentos = rows.filter((r: any) => isExento(r.exento)).length;
        const aplica18 = rows.filter((r: any) =>
          isExento(r.aplica_impuesto_18)
        ).length;
        const aplicaTur = rows.filter((r: any) =>
          isExento(r.aplica_impuesto_turistico)
        ).length;
        setSummary({
          categorias: categoriasSet.size,
          marcas: marcasSet.size,
          items,
          productos,
          servicios,
          publicadas,
          exentos,
          aplica_impuesto_18: aplica18,
          aplica_impuesto_turistico: aplicaTur,
        });
        setCategoriasList(Array.from(categoriasSet).sort());
        setMarcasList(Array.from(marcasSet).sort());
      } catch (err) {
        console.error("Error loading inventario summary", err);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={{ padding: "clamp(8px, 2vw, 18px)" }}>
      <h2 style={{ marginTop: 0, fontSize: "clamp(18px, 3vw, 24px)" }}>
        PRODUCTOS
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "clamp(8px, 1.5vw, 12px)",
          marginBottom: 16,
        }}
      >
        <Card
          label="Categorías (cuenta)"
          value={summary ? String(summary.categorias) : "..."}
        />
        <Card label="Marcas" value={summary ? String(summary.marcas) : "..."} />
        <Card label="Items" value={summary ? String(summary.items) : "..."} />
        <Card
          label="📦 Productos"
          value={summary ? String(summary.productos) : "..."}
        />
        <Card
          label="⚙️ Servicios"
          value={summary ? String(summary.servicios) : "..."}
        />
        <Card
          label="Publicadas en web"
          value={summary ? String(summary.publicadas) : "..."}
        />
        <Card
          label="Exentos"
          value={summary ? String(summary.exentos) : "..."}
        />
        <Card
          label="Aplica impuesto 18%"
          value={summary ? String(summary.aplica_impuesto_18) : "..."}
          hidden
        />
        <Card
          label="Impuesto turístico"
          value={summary ? String(summary.aplica_impuesto_turistico) : "..."}
          hidden
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(6px, 1.5vw, 8px)",
          alignItems: "center",
          marginBottom: 12,
          fontSize: "clamp(11px, 2vw, 13px)",
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#374151" }}>Categoria:</div>
          <select
            value={selectedCategoria}
            onChange={(e) => setSelectedCategoria(e.target.value)}
            className="input"
          >
            <option value="">Todas</option>
            {categoriasList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#374151" }}>Marca:</div>
          <select
            value={selectedMarca}
            onChange={(e) => setSelectedMarca(e.target.value)}
            className="input"
          >
            <option value="">Todas</option>
            {marcasList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn-opaque"
          onClick={() => {
            setSelectedCategoria("");
            setSelectedMarca("");
          }}
        >
          Limpiar filtros
        </button>
        <button
          className="btn-opaque"
          onClick={() => {
            // apply print-only class to body so print CSS can hide other elements
            document.body.classList.add("print-table-only");
            // small timeout to let class apply
            setTimeout(() => {
              window.print();
              document.body.classList.remove("print-table-only");
            }, 50);
          }}
        >
          Imprimir tabla
        </button>
      </div>

      <div
        style={{
          maxHeight: "65vh",
          overflowY: "auto",
          width: "100%",
          overflowX: "hidden",
        }}
      >
        <SupabaseTable
          table="inventario"
          select="id, nombre, sku, codigo_barras, categoria, marca, descripcion, modelo, tipo, publicacion_web, exento, aplica_impuesto_18, aplica_impuesto_turistico, creado_en,imagen"
          title=""
          order={["id", "categoria", "marca"]}
          filters={{
            categoria: selectedCategoria || undefined,
            marca: selectedMarca || undefined,
          }}
          columns={[
            "imagen",
            "sku",
            "descripcion",
            "marca",
            "modelo",
            "categoria",
          ]}
          searchColumns={[
            "nombre",
            "sku",
            "descripcion",
            "codigo_barras",
            "modelo",
          ]}
          formExclude={[
            "codigo_barras",
            "creado_en",
            "aplica_impuesto_18",
            "aplica_impuesto_turistico",
          ]}
          fieldOptions={{ categoria: categoriasList }}
          allowAdd={true}
          allowEdit={true}
          allowDelete={true}
        />
      </div>
    </div>
  );
}

function Card({ label, value, hidden }: { label: string; value: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div
      style={{
        padding: "clamp(8px, 1.5vw, 12px)",
        background: "#fff",
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        minWidth: "clamp(100px, 20vw, 140px)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "clamp(10px, 1.8vw, 12px)",
          color: "#6b7280",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "clamp(16px, 3vw, 20px)",
          fontWeight: 700,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}
