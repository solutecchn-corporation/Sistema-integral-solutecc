import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  type DragEvent,
} from "react";
import supabase from "../../lib/supabaseClient";

// ─── Constantes ────────────────────────────────────────────────────────────────
const BUCKET = "banners-promocionales";
const SUPABASE_URL = "https://ooiklfrvtokofzomzksu.supabase.co";
const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Tipo ─────────────────────────────────────────────────────────────────────
interface BannerPromocional {
  id: number;
  titulo: string | null;
  subtitulo: string | null;
  imagen_url: string;
  enlace: string | null;
  orden: number;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_at?: string;
}

type ModalMode = "create" | "edit" | "preview" | null;

const BLANK_FORM: Omit<BannerPromocional, "id" | "created_at"> = {
  titulo: "",
  subtitulo: "",
  imagen_url: "",
  enlace: "",
  orden: 0,
  activo: true,
  fecha_inicio: null,
  fecha_fin: null,
};

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 700,
  fontSize: 12,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: "#f8fafc",
  borderBottom: "2px solid #e2e8f0",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "#1e293b",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
};
const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: "8px 18px",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const BTN_DANGER: React.CSSProperties = {
  ...BTN_PRIMARY,
  background: "#ef4444",
};
const BTN_GHOST: React.CSSProperties = {
  ...BTN_PRIMARY,
  background: "#64748b",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildPublicUrl(path: string): string {
  // Si ya es una URL completa, devolverla tal cual
  if (path.startsWith("http")) return path;
  return `${PUBLIC_BASE}/${path}`;
}

function extractStoragePath(url: string): string | null {
  // Extrae la ruta relativa dentro del bucket a partir de la URL pública
  const marker = `${PUBLIC_BASE}/`;
  if (url.startsWith(marker)) return url.slice(marker.length);
  return null;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type))
    return "Solo se permiten imágenes JPG, PNG, WEBP o GIF.";
  if (file.size > MAX_SIZE_BYTES)
    return "La imagen no puede pesar más de 5 MB.";
  return null;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function BannersPromocionales() {
  // ── State ───────────────────────────────────────────────────────────────────
  const [banners, setBanners] = useState<BannerPromocional[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // Modal
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTarget, setEditTarget] = useState<BannerPromocional | null>(null);
  const [previewTarget, setPreviewTarget] = useState<BannerPromocional | null>(
    null,
  );

  // Formulario
  const [form, setForm] =
    useState<Omit<BannerPromocional, "id" | "created_at">>(BLANK_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Drag & Drop
  const dragIdxRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchBanners = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("banners_promocionales")
      .select("*")
      .order("orden", { ascending: true });
    if (error) showMsg("err", "Error al cargar banners: " + error.message);
    else setBanners(data as BannerPromocional[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  // ── Mensajes ─────────────────────────────────────────────────────────────────
  function showMsg(type: "ok" | "err", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  // ── Subida de imagen ─────────────────────────────────────────────────────────
  async function uploadImage(file: File): Promise<string | null> {
    const ext = file.name.split(".").pop() ?? "jpg";
    const safeName = file.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "");
    const fileName = `${Date.now()}_${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, { contentType: file.type, upsert: false });

    if (error) {
      showMsg("err", "Error al subir imagen: " + error.message);
      return null;
    }
    return `${PUBLIC_BASE}/${fileName}`;
  }

  // ── Manejo de archivo seleccionado ────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageError(null);
    if (!file) {
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }
    const err = validateFile(file);
    if (err) {
      setImageError(err);
      setImageFile(null);
      setImagePreviewUrl(null);
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreviewUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  // ── Abrir modal crear ─────────────────────────────────────────────────────────
  function openCreate() {
    const maxOrden = banners.reduce((m, b) => Math.max(m, b.orden), -1);
    setForm({ ...BLANK_FORM, orden: maxOrden + 1 });
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageError(null);
    setEditTarget(null);
    setModalMode("create");
  }

  // ── Abrir modal editar ────────────────────────────────────────────────────────
  function openEdit(b: BannerPromocional) {
    setForm({
      titulo: b.titulo ?? "",
      subtitulo: b.subtitulo ?? "",
      imagen_url: b.imagen_url,
      enlace: b.enlace ?? "",
      orden: b.orden,
      activo: b.activo,
      fecha_inicio: b.fecha_inicio ?? null,
      fecha_fin: b.fecha_fin ?? null,
    });
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageError(null);
    setEditTarget(b);
    setModalMode("edit");
  }

  // ── Guardar (crear / editar) ──────────────────────────────────────────────────
  async function handleSave() {
    if (!imageFile && !form.imagen_url) {
      setImageError("Debes seleccionar una imagen.");
      return;
    }

    setSaving(true);
    let finalUrl = form.imagen_url;

    if (imageFile) {
      const url = await uploadImage(imageFile);
      if (!url) {
        setSaving(false);
        return;
      }
      finalUrl = url;
    }

    const payload = {
      titulo: form.titulo || null,
      subtitulo: form.subtitulo || null,
      imagen_url: finalUrl,
      enlace: form.enlace || null,
      orden: Number(form.orden),
      activo: form.activo,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
    };

    if (modalMode === "create") {
      const { error } = await supabase
        .from("banners_promocionales")
        .insert(payload);
      if (error) showMsg("err", "Error al crear banner: " + error.message);
      else showMsg("ok", "Banner creado correctamente.");
    } else if (modalMode === "edit" && editTarget) {
      // Si se subió nueva imagen, eliminar la anterior del bucket
      if (imageFile && editTarget.imagen_url) {
        const oldPath = extractStoragePath(editTarget.imagen_url);
        if (oldPath) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }
      const { error } = await supabase
        .from("banners_promocionales")
        .update(payload)
        .eq("id", editTarget.id);
      if (error) showMsg("err", "Error al actualizar banner: " + error.message);
      else showMsg("ok", "Banner actualizado correctamente.");
    }

    setSaving(false);
    setModalMode(null);
    fetchBanners();
  }

  // ── Toggle activo ─────────────────────────────────────────────────────────────
  async function toggleActivo(b: BannerPromocional) {
    const { error } = await supabase
      .from("banners_promocionales")
      .update({ activo: !b.activo })
      .eq("id", b.id);
    if (error) showMsg("err", "No se pudo cambiar estado: " + error.message);
    else
      setBanners((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, activo: !b.activo } : x)),
      );
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────────
  async function handleDelete(b: BannerPromocional) {
    if (
      !window.confirm(
        `¿Eliminar el banner "${b.titulo ?? "sin título"}"? Esta acción no se puede deshacer.`,
      )
    )
      return;

    // 1. Borrar archivo del bucket
    const storagePath = extractStoragePath(b.imagen_url);
    if (storagePath) {
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);
      if (storageErr)
        showMsg(
          "err",
          "Advertencia: no se pudo borrar la imagen del bucket: " +
            storageErr.message,
        );
    }

    // 2. Borrar fila de la tabla
    const { error } = await supabase
      .from("banners_promocionales")
      .delete()
      .eq("id", b.id);
    if (error) showMsg("err", "Error al eliminar banner: " + error.message);
    else {
      showMsg("ok", "Banner eliminado.");
      fetchBanners();
    }
  }

  // ── Drag & Drop (reordenar) ───────────────────────────────────────────────────
  function handleDragStart(e: DragEvent<HTMLTableRowElement>, idx: number) {
    dragIdxRef.current = idx;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent<HTMLTableRowElement>, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }

  async function handleDrop(
    e: DragEvent<HTMLTableRowElement>,
    dropIdx: number,
  ) {
    e.preventDefault();
    const dragIdx = dragIdxRef.current;
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragOverIdx(null);
      return;
    }

    const reordered = [...banners];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);

    // Asignar nuevo orden secuencial
    const updated = reordered.map((b, i) => ({ ...b, orden: i }));
    setBanners(updated);
    setDragOverIdx(null);
    dragIdxRef.current = null;

    // Persistir en Supabase (batch updates)
    const promises = updated.map((b) =>
      supabase
        .from("banners_promocionales")
        .update({ orden: b.orden })
        .eq("id", b.id),
    );
    const results = await Promise.all(promises);
    const failed = results.find((r) => r.error);
    if (failed)
      showMsg("err", "Error al guardar orden: " + failed.error?.message);
    else showMsg("ok", "Orden guardado.");
  }

  function handleDragEnd() {
    dragIdxRef.current = null;
    setDragOverIdx(null);
  }

  // ── Form helpers ──────────────────────────────────────────────────────────────
  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  const currentImgSrc =
    imagePreviewUrl ||
    (form.imagen_url ? buildPublicUrl(form.imagen_url) : null);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 16px 40px" }}>
      {/* ── Encabezado ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>
            🖼 Banners Promocionales
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            Arrastra las filas para reordenar. Bucket: <code>{BUCKET}</code>
          </p>
        </div>
        <button style={BTN_PRIMARY} onClick={openCreate}>
          + Nuevo banner
        </button>
      </div>

      {/* ── Notificación ───────────────────────────────────────────────────── */}
      {msg && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 8,
            background: msg.type === "ok" ? "#dcfce7" : "#fee2e2",
            color: msg.type === "ok" ? "#166534" : "#991b1b",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {msg.text}
        </div>
      )}

      {/* ── Tabla ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
          Cargando banners…
        </div>
      ) : banners.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: "center",
            color: "#94a3b8",
            border: "2px dashed #e2e8f0",
            borderRadius: 12,
          }}
        >
          No hay banners aún. Crea el primero con el botón de arriba.
        </div>
      ) : (
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              background: "#fff",
            }}
          >
            <thead>
              <tr>
                <th style={{ ...TH, width: 36 }}></th>
                <th style={{ ...TH, width: 90 }}>Vista previa</th>
                <th style={TH}>Título / Subtítulo</th>
                <th style={{ ...TH, width: 60, textAlign: "center" }}>Orden</th>
                <th style={{ ...TH, width: 80, textAlign: "center" }}>
                  Estado
                </th>
                <th style={TH}>Fechas</th>
                <th style={{ ...TH, width: 160, textAlign: "center" }}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b, idx) => (
                <tr
                  key={b.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  style={{
                    cursor: "grab",
                    background:
                      dragOverIdx === idx
                        ? "#eff6ff"
                        : idx % 2 === 0
                          ? "#fff"
                          : "#fafafa",
                    outline:
                      dragOverIdx === idx ? "2px dashed #3b82f6" : "none",
                    transition: "background 120ms",
                  }}
                >
                  {/* Handle */}
                  <td style={{ ...TD, textAlign: "center", color: "#cbd5e1" }}>
                    ⠿
                  </td>

                  {/* Imagen */}
                  <td style={TD}>
                    <img
                      src={buildPublicUrl(b.imagen_url)}
                      alt={b.titulo ?? "banner"}
                      style={{
                        width: 80,
                        height: 42,
                        objectFit: "cover",
                        borderRadius: 6,
                        border: "1px solid #e2e8f0",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setPreviewTarget(b);
                        setModalMode("preview");
                      }}
                      onError={(e) =>
                        ((e.currentTarget as HTMLImageElement).style.opacity =
                          "0.3")
                      }
                    />
                  </td>

                  {/* Título */}
                  <td style={TD}>
                    <div style={{ fontWeight: 600 }}>
                      {b.titulo || (
                        <span style={{ color: "#94a3b8" }}>Sin título</span>
                      )}
                    </div>
                    {b.subtitulo && (
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {b.subtitulo}
                      </div>
                    )}
                    {b.enlace && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#3b82f6",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: 220,
                          whiteSpace: "nowrap",
                        }}
                      >
                        🔗 {b.enlace}
                      </div>
                    )}
                  </td>

                  {/* Orden */}
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700 }}>
                    {b.orden}
                  </td>

                  {/* Toggle activo */}
                  <td style={{ ...TD, textAlign: "center" }}>
                    <button
                      onClick={() => toggleActivo(b)}
                      title={b.activo ? "Desactivar" : "Activar"}
                      style={{
                        width: 46,
                        height: 26,
                        border: "none",
                        borderRadius: 13,
                        cursor: "pointer",
                        background: b.activo ? "#22c55e" : "#cbd5e1",
                        position: "relative",
                        transition: "background 200ms",
                        padding: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 3,
                          left: b.activo ? 23 : 3,
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "#fff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          transition: "left 200ms",
                        }}
                      />
                    </button>
                    <div
                      style={{
                        fontSize: 10,
                        marginTop: 4,
                        color: b.activo ? "#16a34a" : "#94a3b8",
                        fontWeight: 600,
                      }}
                    >
                      {b.activo ? "Activo" : "Inactivo"}
                    </div>
                  </td>

                  {/* Fechas */}
                  <td style={TD}>
                    <div style={{ fontSize: 12 }}>
                      {b.fecha_inicio ? (
                        <>
                          <span style={{ color: "#64748b" }}>Desde:</span>{" "}
                          {b.fecha_inicio}
                        </>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12 }}>
                      {b.fecha_fin ? (
                        <>
                          <span style={{ color: "#64748b" }}>Hasta:</span>{" "}
                          {b.fecha_fin}
                        </>
                      ) : null}
                    </div>
                    {!b.fecha_inicio && !b.fecha_fin && (
                      <span style={{ color: "#cbd5e1", fontSize: 12 }}>
                        Sin fechas
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td style={{ ...TD, textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        justifyContent: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        style={{
                          ...BTN_GHOST,
                          fontSize: 11,
                          padding: "5px 10px",
                        }}
                        onClick={() => {
                          setPreviewTarget(b);
                          setModalMode("preview");
                        }}
                      >
                        👁 Ver
                      </button>
                      <button
                        style={{
                          ...BTN_PRIMARY,
                          fontSize: 11,
                          padding: "5px 10px",
                        }}
                        onClick={() => openEdit(b)}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        style={{
                          ...BTN_DANGER,
                          fontSize: 11,
                          padding: "5px 10px",
                        }}
                        onClick={() => handleDelete(b)}
                      >
                        🗑 Borrar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL CREAR / EDITAR
      ═══════════════════════════════════════════════════════════════════════ */}
      {(modalMode === "create" || modalMode === "edit") && (
        <ModalOverlay onClose={() => !saving && setModalMode(null)}>
          <div style={{ width: "min(640px, 95vw)" }}>
            <h3 style={{ margin: "0 0 18px", fontSize: 16, color: "#0f172a" }}>
              {modalMode === "create" ? "➕ Nuevo Banner" : "✏️ Editar Banner"}
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px 20px",
              }}
            >
              {/* Título */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>Título</label>
                <input
                  style={INPUT}
                  value={form.titulo ?? ""}
                  onChange={(e) => setField("titulo", e.target.value)}
                  placeholder="Ej: Ofertas de verano"
                />
              </div>

              {/* Subtítulo */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>Subtítulo</label>
                <input
                  style={INPUT}
                  value={form.subtitulo ?? ""}
                  onChange={(e) => setField("subtitulo", e.target.value)}
                  placeholder="Ej: Hasta 50% de descuento"
                />
              </div>

              {/* Enlace */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>Enlace al hacer clic</label>
                <input
                  style={INPUT}
                  value={form.enlace ?? ""}
                  onChange={(e) => setField("enlace", e.target.value)}
                  placeholder="https://..."
                />
              </div>

              {/* Orden */}
              <div>
                <label style={LABEL}>Orden (menor = primero)</label>
                <input
                  style={INPUT}
                  type="number"
                  min={0}
                  value={form.orden}
                  onChange={(e) =>
                    setField("orden", parseInt(e.target.value) || 0)
                  }
                />
              </div>

              {/* Activo */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingTop: 18,
                }}
              >
                <label style={{ ...LABEL, margin: 0 }}>Activo</label>
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setField("activo", e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
              </div>

              {/* Fecha inicio */}
              <div>
                <label style={LABEL}>Fecha inicio</label>
                <input
                  style={INPUT}
                  type="date"
                  value={form.fecha_inicio ?? ""}
                  onChange={(e) =>
                    setField("fecha_inicio", e.target.value || null)
                  }
                />
              </div>

              {/* Fecha fin */}
              <div>
                <label style={LABEL}>Fecha fin</label>
                <input
                  style={INPUT}
                  type="date"
                  value={form.fecha_fin ?? ""}
                  onChange={(e) =>
                    setField("fecha_fin", e.target.value || null)
                  }
                />
              </div>

              {/* Imagen */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>
                  Imagen{" "}
                  <span style={{ fontWeight: 400, color: "#94a3b8" }}>
                    (JPG, PNG, WEBP, GIF — máx. 5 MB)
                  </span>
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.gif"
                  onChange={handleFileChange}
                  style={{ fontSize: 13, cursor: "pointer" }}
                />
                {imageError && (
                  <div style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>
                    {imageError}
                  </div>
                )}
              </div>

              {/* Previsualización */}
              {currentImgSrc && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LABEL}>Previsualización</label>
                  <BannerSlide
                    imagen_url={currentImgSrc}
                    titulo={form.titulo}
                    subtitulo={form.subtitulo}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 22,
              }}
            >
              <button
                style={BTN_GHOST}
                onClick={() => setModalMode(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                style={BTN_PRIMARY}
                onClick={handleSave}
                disabled={saving || !!imageError}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL PREVIEW
      ═══════════════════════════════════════════════════════════════════════ */}
      {modalMode === "preview" && previewTarget && (
        <ModalOverlay onClose={() => setModalMode(null)}>
          <div>
            <h3
              style={{
                margin: "0 0 14px",
                fontSize: 15,
                color: "#0f172a",
              }}
            >
              👁 Vista previa del banner
            </h3>
            <BannerSlide
              imagen_url={buildPublicUrl(previewTarget.imagen_url)}
              titulo={previewTarget.titulo}
              subtitulo={previewTarget.subtitulo}
            />
            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "#64748b",
                lineHeight: 1.6,
              }}
            >
              <strong>Orden:</strong> {previewTarget.orden} &nbsp;|&nbsp;
              <strong>Estado:</strong>{" "}
              <span
                style={{
                  color: previewTarget.activo ? "#16a34a" : "#dc2626",
                }}
              >
                {previewTarget.activo ? "Activo" : "Inactivo"}
              </span>
              {previewTarget.enlace && (
                <>
                  {" "}
                  &nbsp;|&nbsp; <strong>Enlace:</strong>{" "}
                  <a
                    href={previewTarget.enlace}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb" }}
                  >
                    {previewTarget.enlace}
                  </a>
                </>
              )}
              {(previewTarget.fecha_inicio || previewTarget.fecha_fin) && (
                <div>
                  <strong>Vigencia:</strong> {previewTarget.fecha_inicio ?? "—"}{" "}
                  → {previewTarget.fecha_fin ?? "—"}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", marginTop: 18 }}>
              <button style={BTN_GHOST} onClick={() => setModalMode(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Subcomponente: slide de banner 420×220 ───────────────────────────────────
function BannerSlide({
  imagen_url,
  titulo,
  subtitulo,
}: {
  imagen_url: string;
  titulo: string | null | undefined;
  subtitulo: string | null | undefined;
}) {
  return (
    <div
      style={{
        width: 420,
        height: 220,
        maxWidth: "100%",
        borderRadius: 12,
        overflow: "hidden",
        position: "relative",
        background: "#1e293b",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}
    >
      <img
        src={imagen_url}
        alt="banner"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
        onError={(e) =>
          ((e.currentTarget as HTMLImageElement).style.opacity = "0.2")
        }
      />
      {(titulo || subtitulo) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.0) 60%)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "0 20px 18px",
          }}
        >
          {titulo && (
            <div
              style={{
                color: "#fff",
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1.2,
                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
              }}
            >
              {titulo}
            </div>
          )}
          {subtitulo && (
            <div
              style={{
                color: "#e2e8f0",
                fontSize: 13,
                marginTop: 4,
                textShadow: "0 1px 3px rgba(0,0,0,0.4)",
              }}
            >
              {subtitulo}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponente: overlay de modal ──────────────────────────────────────────
function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          padding: "24px 28px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
          maxHeight: "90vh",
          overflowY: "auto",
          width: "100%",
          maxWidth: 680,
        }}
      >
        {children}
      </div>
    </div>
  );
}
