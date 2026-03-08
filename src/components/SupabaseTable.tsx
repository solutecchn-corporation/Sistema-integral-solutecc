import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import RecordFormModal from "./RecordFormModal";
import ProductDetailModal from "./ProductDetailModal";
// RecordFormModal is defined at the end of this file to avoid a missing module error.

type Props = {
  table: string;
  select?: string; // supabase select string, e.g. 'id, username, email'
  title?: string;
  limit?: number;
  columns?: string[]; // optional explicit column order/names to show
  searchColumns?: string[]; // columns to search on
  order?: string | string[]; // optional order, e.g. 'id' or ['id','categoria']
  filters?: Record<string, any>;
  allowAdd?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  formExclude?: string[]; // columns to exclude from the add/edit form
  formColumns?: string[]; // if set, overrides displayedColumns for the add/edit form
  fieldOptions?: Record<string, string[]>; // options for combo fields (e.g. categoria)
};

export default function SupabaseTable({
  table,
  select,
  title,
  limit = 500,
  columns,
  searchColumns,
  order,
  filters,
  allowAdd = false,
  allowEdit = false,
  allowDelete = false,
  formExclude = [],
  formColumns,
  fieldOptions = {},
}: Props) {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [formInitial, setFormInitial] = useState<any>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<any>(null);

  const mountedRef = useRef(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sup = (await import("../lib/supabaseClient")).default;
      const sel = select || "*";
      // build query with optional ordering
      let query: any = sup.from(table).select(sel).limit(limit);
      if (order) {
        const orders: string[] = Array.isArray(order)
          ? order
          : String(order)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
        orders.forEach((o: string) => {
          // allow optional direction like 'col desc' or 'col asc'
          const parts = o
            .split(" ")
            .map((p: string) => p.trim())
            .filter(Boolean);
          const col = parts[0];
          const dir = parts[1] ? parts[1].toLowerCase() : "asc";
          query = query.order(col, { ascending: dir !== "desc" });
        });
      }
      // apply simple equality filters if provided
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v == null || v === "") return;
          // use exact match for now
          query = query.eq(k, v);
        });
      }
      const res = await query;
      console.debug("SupabaseTable fetch result for", table, res);
      if (!mountedRef.current) return;
      if (res.error) throw res.error;
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error("SupabaseTable error", err);
      setError(err?.message || String(err));
      setData([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [table, select, limit]);

  const displayedColumns = useMemo(() => {
    if (columns && columns.length > 0) return columns;
    if (!data || data.length === 0) return [];
    // take keys from first item
    return Object.keys(data[0]);
  }, [columns, data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const q = (query || "").toString().trim().toLowerCase();
    if (!q) return data;
    const cols =
      searchColumns && searchColumns.length > 0
        ? searchColumns
        : displayedColumns;
    return data.filter((row) =>
      cols.some((c) => {
        const v = row?.[c];
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      })
    );
  }, [data, query, searchColumns, displayedColumns]);

  const openAdd = () => {
    if (!allowAdd) return;
    setFormMode("add");
    setFormInitial({});
    setFormOpen(true);
  };

  const openEdit = (row: any) => {
    if (!allowEdit) return;
    setFormMode("edit");
    setFormInitial(row);
    setFormOpen(true);
  };

  const handleSave = async (formData: any) => {
    const sup = (await import("../lib/supabaseClient")).default;
    try {
      // If there is an image File object, upload it to Supabase Storage first
      const BUCKET =
        (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string) ||
        "inventario";

      const payload = { ...formData };
      const oldImage = formMode === "edit" ? formInitial?.imagen ?? null : null;
      const getStoragePath = (img: string | null) => {
        if (!img) return null;
        // If it's already a storage path (not a full url), return it
        if (!img.startsWith("http")) return img;
        const m = img.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.*)/);
        if (!m) return null;
        // m[2] is the path part
        return decodeURIComponent(m[2]);
      };

      if (payload.imagen && payload.imagen instanceof File) {
        const file: File = payload.imagen;
        // Use a stable-ish filename: table/<id or uuid>/<timestamp>_name.ext
        const namePrefix =
          payload.id ??
          (crypto && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : String(Date.now()));
        const filename = `${table}/${namePrefix}/${Date.now()}_${file.name.replace(
          /[^a-zA-Z0-9.\-_/]/g,
          "_"
        )}`;

        const uploadRes = await sup.storage
          .from(BUCKET)
          .upload(filename, file, {
            upsert: true,
          });
        if (uploadRes.error) throw uploadRes.error;
        // Save the storage path (more robust). uploadRes.data.path typically contains the stored path.
        // We'll resolve a public/signed URL when rendering.
        const storedPath = (uploadRes as any).data?.path ?? filename;
        payload.imagen = storedPath;

        // If we replaced an existing image (oldImage), try to remove it
        try {
          const oldPath = getStoragePath(oldImage);
          if (oldPath && oldPath !== storedPath) {
            const rm = await sup.storage.from(BUCKET).remove([oldPath]);
            if (rm.error) console.warn("Failed to remove old image", rm.error);
          }
        } catch (err) {
          console.warn("Error removing old image", err);
        }
      }

      // If editing and user cleared the image (set to null), remove old image
      if (
        formMode === "edit" &&
        (payload.imagen == null || payload.imagen === "")
      ) {
        try {
          const oldPath = getStoragePath(formInitial?.imagen ?? null);
          if (oldPath) {
            const rm = await sup.storage.from(BUCKET).remove([oldPath]);
            if (rm.error)
              console.warn("Failed to remove old image on clear", rm.error);
          }
        } catch (err) {
          console.warn("Error removing old image on clear", err);
        }
      }

      if (formMode === "add") {
        const { error } = await sup.from(table).insert([payload]);
        if (error) throw error;
      } else {
        const id = payload.id;
        const toUpdate = { ...payload };
        delete toUpdate.id;
        const { error } = await sup.from(table).update(toUpdate).eq("id", id);
        if (error) throw error;
      }
      setFormOpen(false);
      await fetchData();
    } catch (err: any) {
      console.error("Error saving", err);
      setError(err?.message || String(err));
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    const sup = (await import("../lib/supabaseClient")).default;
    try {
      if (!allowDelete) return;
      // Try to remove the image from storage (if any) before deleting the DB row
      try {
        const BUCKET =
          (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string) ||
          "inventario";
        const row = data?.find((r) => r.id === deleteId);
        const getStoragePath = (img: string | null) => {
          if (!img) return null;
          if (!img.startsWith("http")) return img;
          const m = img.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.*)/);
          if (!m) return null;
          // m[2] is the object path inside the bucket (e.g. 'inventario/uuid/file.png')
          return decodeURIComponent(m[2]);
        };
        const img = row?.imagen ?? null;
        const path = getStoragePath(img);
        if (path) {
          const rm = await sup.storage.from(BUCKET).remove([path]);
          if (rm.error)
            console.warn("Failed to remove image on delete", rm.error);
        }
      } catch (err) {
        console.warn("Error removing image before delete", err);
      }

      const { error } = await sup.from(table).delete().eq("id", deleteId);
      if (error) throw error;
      setConfirmOpen(false);
      setDeleteId(null);
      await fetchData();
    } catch (err: any) {
      console.error("Error deleting", err);
      setError(err?.message || String(err));
    }
  };

  return (
    <div style={{ padding: "clamp(10px, 2vw, 18px)", width: "100%" }}>
      {title ? (
        <h2 style={{ marginTop: 0, fontSize: "clamp(18px, 3vw, 24px)" }}>
          {title}
        </h2>
      ) : null}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(6px, 1.5vw, 8px)",
          marginBottom: 12,
        }}
      >
        <input
          placeholder="Buscar..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input"
          style={{
            minWidth: "clamp(180px, 40vw, 240px)",
            flex: "1 1 auto",
            fontSize: "clamp(12px, 2vw, 14px)",
          }}
        />
        <button
          onClick={() => {
            setError(null);
            setQuery("");
            fetchData();
          }}
          className="btn-opaque"
          style={{
            fontSize: "clamp(11px, 2vw, 13px)",
            padding: "clamp(6px, 1.2vw, 8px) clamp(10px, 2vw, 12px)",
          }}
        >
          Recargar
        </button>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={openAdd}
            className="btn-primary"
            style={{
              fontSize: "clamp(11px, 2vw, 13px)",
              padding: "clamp(6px, 1.2vw, 8px) clamp(10px, 2vw, 12px)",
            }}
          >
            Agregar
          </button>
        </div>
      </div>

      {loading && <div>Cargando datos de `{table}` desde Supabase...</div>}
      {error && <div style={{ color: "#b91c1c" }}>Error: {error}</div>}

      {!loading && data && data.length === 0 && (
        <div>
          No hay registros en la tabla <strong>{table}</strong>.
        </div>
      )}

      {!loading && filtered && filtered.length > 0 && (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <table className="admin-table" style={{ minWidth: "100%" }}>
            <thead>
              <tr>
                {displayedColumns.map((col) => (
                  <th key={col}>
                    {col === "sku"
                      ? "CODIGO"
                      : String(col).replace(/_/g, " ").toUpperCase()}
                  </th>
                ))}
                <th style={{ width: 140 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={row.id ?? idx}>
                  {displayedColumns.map((col) => {
                    // Force render the imagen column using the raw row.imagen value
                    if (col === "imagen") {
                      const val = row?.imagen ?? null;
                      if (!val)
                        console.debug(
                          "SupabaseTable: row has no imagen for id",
                          row?.id,
                          row
                        );
                      return (
                        <td
                          key={col}
                          style={{
                            width: "clamp(80px, 15vw, 120px)",
                            maxWidth: "clamp(80px, 15vw, 120px)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {val ? (
                            <Thumbnail src={String(val)} />
                          ) : (
                            <span style={{ color: "#6b7280" }}>-</span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col}
                        style={{
                          maxWidth: 320,
                          wordBreak: "break-word" as any,
                          whiteSpace: "normal",
                        }}
                      >
                        {formatCell(row[col])}
                      </td>
                    );
                  })}
                  <td className="admin-actions">
                    <button
                      className="btn-opaque"
                      onClick={() => {
                        setDetailRow(row);
                        setDetailOpen(true);
                      }}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordFormModal
        open={formOpen}
        title={formMode === "add" ? `Agregar a ${table}` : `Editar ${table}`}
        columns={(formColumns ?? displayedColumns).filter((c) => !formExclude.includes(c))}
        initialData={formInitial}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        fieldOptions={fieldOptions}
      />

      <ProductDetailModal
        open={detailOpen}
        data={detailRow}
        title={`Detalle de ${table}`}
        onClose={() => setDetailOpen(false)}
        onEdit={(row) => {
          setDetailOpen(false);
          openEdit(row);
        }}
        onDeleteClick={(id) => {
          setDetailOpen(false);
          setDeleteId(id);
          setConfirmOpen(true);
        }}
      />

      <ConfirmModal
        open={confirmOpen}
        title="Confirmar eliminación"
        message={`¿Eliminar registro de ${table}?`}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function formatCell(v: any) {
  if (v == null) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  // Normalize boolean-like values to 'Sí' / 'No'
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number" && (v === 0 || v === 1))
    return v === 1 ? "Sí" : "No";
  // Render small image thumbnails for image URLs
  if (typeof v === "string") {
    const lower = v.toLowerCase().trim();
    if (
      lower === "1" ||
      lower === "true" ||
      lower === "t" ||
      lower === "si" ||
      lower === "s" ||
      lower === "yes"
    )
      return "Sí";
    if (
      lower === "0" ||
      lower === "false" ||
      lower === "f" ||
      lower === "no" ||
      lower === "n" ||
      lower === "not"
    )
      return "No";
    if (
      (v.startsWith("http") || v.startsWith("/")) &&
      (lower.endsWith(".png") ||
        lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".webp") ||
        lower.endsWith(".svg") ||
        lower.includes("/storage/"))
    ) {
      return <Thumbnail src={v} />;
    }
  }
  return String(v);
}

function Thumbnail({ src }: { src: string }) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      if (!src) return;
      // If src looks like a full URL, use it directly
      if (src.startsWith("http")) {
        if (mounted) setImgSrc(src);
        return;
      }
      // Normalize possible storage public path: '/storage/v1/object/public/<BUCKET>/path'
      let objectPath = src;
      const m = String(src).match(
        /\/storage\/v1\/object\/public\/([^/]+)\/(.*)/
      );
      if (m) {
        objectPath = decodeURIComponent(m[2]);
      }
      // objectPath is already the path inside the bucket (e.g. 'inventario/uuid/file.png')
      const BUCKET =
        (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string) ||
        "inventario";
      try {
        const sup = (await import("../lib/supabaseClient")).default;
        const BUCKET =
          (import.meta.env.VITE_SUPABASE_STORAGE_BUCKET as string) ||
          "inventario";
        // objectPath is a storage path (e.g. 'inventario/uuid/file.png')
        const publicRes = await sup.storage
          .from(BUCKET)
          .getPublicUrl(objectPath);
        const publicUrl =
          (publicRes as any)?.data?.publicUrl ||
          (publicRes as any)?.data?.publicURL ||
          null;
        if (publicUrl) {
          if (mounted) setImgSrc(publicUrl);
          return;
        }
        const signed = await sup.storage
          .from(BUCKET)
          .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
        if (signed.error) {
          console.warn("Thumbnail createSignedUrl error", signed.error);
          if (mounted) setImgSrc(null);
          return;
        }
        const url = (signed.data as any)?.signedUrl ?? null;
        if (mounted) setImgSrc(url);
      } catch (err) {
        console.error("Thumbnail resolve error", err);
        if (mounted) setImgSrc(null);
      }
    };
    resolve();
    return () => {
      mounted = false;
    };
  }, [src]);

  // While resolving, render a small placeholder so the table cell stays visible.
  if (!imgSrc && !failedUrl) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: "clamp(60px, 12vw, 100px)",
          height: "clamp(40px, 8vw, 60px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3f4f6",
          color: "#6b7280",
          borderRadius: 4,
          fontSize: "clamp(8px, 1.5vw, 10px)",
        }}
      >
        Cargando...
      </div>
    );
  }

  if (imgSrc) {
    return (
      <img
        src={encodeURI(imgSrc)}
        alt="img"
        style={{
          maxWidth: "clamp(60px, 12vw, 100px)",
          maxHeight: "clamp(40px, 8vw, 60px)",
          objectFit: "contain",
          width: "100%",
        }}
        onError={(e) => {
          setFailedUrl(imgSrc);
          setImgSrc(null);
        }}
      />
    );
  }

  // fallback when thumbnail failed to load: show small link/placeholder
  return (
    <div
      style={{
        width: 140,
        height: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff7ed",
        border: "1px dashed #f59e0b",
        padding: 4,
      }}
    >
      <a
        href={failedUrl ?? src}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: 12,
          color: "#92400e",
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
      >
        Abrir imagen
      </a>
    </div>
  );
}
