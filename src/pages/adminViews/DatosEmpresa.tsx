import React, { useEffect, useState } from "react";
import Confirmado from "../../components/Confirmado";
import {
  checkForUpdatesManually,
  performUpdate,
} from "../../components/VersionChecker";

export default function DatosEmpresa() {
  const [company, setCompany] = useState<any | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<boolean>(false);
  const [pendingPayload, setPendingPayload] = useState<any | null>(null);
  const [pendingNeedsLogo, setPendingNeedsLogo] = useState<boolean>(false);
  const [lastSaveError, setLastSaveError] = useState<string | null>(null);
  const [lastSavedLogo, setLastSavedLogo] = useState<string | null>(null);
  const [confirmadoOpen, setConfirmadoOpen] = useState(false);
  const [confirmadoTitle, setConfirmadoTitle] = useState<string>("");
  const [confirmadoMessage, setConfirmadoMessage] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCompanyLoading(true);
      try {
        const sup = (await import("../../lib/supabaseClient")).default;
        const { data, error } = await sup
          .from("empresa")
          .select("*")
          .limit(1)
          .single();
        if (!mounted) return;
        if (error) throw error;
        if (data) {
          setCompany(data);
          setEditForm(data);
          try {
            localStorage.setItem("companyData", JSON.stringify(data));
          } catch {}
          setCompanyLoading(false);
          return;
        }
      } catch (err) {
        console.debug(
          "No se pudo cargar empresa desde Supabase, fallback a JSON/localStorage",
          err,
        );
      }

      try {
        const stored = localStorage.getItem("companyData");
        if (stored) {
          setCompany(JSON.parse(stored));
          setEditForm(JSON.parse(stored));
          setCompanyLoading(false);
          return;
        }
      } catch {}

      try {
        const res = await fetch("/data-base/company.json");
        if (!res.ok) throw new Error("no json");
        const d = await res.json();
        if (!mounted) return;
        setCompany(d);
        setEditForm(d);
      } catch {
        if (mounted) setCompany(null);
      } finally {
        if (mounted) setCompanyLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (company) setEditForm(company);
  }, [company]);

  useEffect(() => {
    try {
      const p = localStorage.getItem("pendingCompanySave");
      if (p) {
        const parsed = JSON.parse(p);
        setPendingSave(true);
        setPendingPayload(parsed.payload ?? null);
        setPendingNeedsLogo(Boolean(parsed.needsLogo));
      }
    } catch {}
  }, []);

  // Resolve public URL for stored company logo (uses Supabase storage getPublicUrl/createSignedUrl)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!company || !company.logo) {
          if (mounted) setLogoUrl(null);
          return;
        }
        const v = String(company.logo);
        if (v.startsWith("http")) {
          if (mounted) setLogoUrl(v);
          return;
        }
        const sup = (await import("../../lib/supabaseClient")).default;
        const BUCKET = "logo";
        const publicRes = await sup.storage.from(BUCKET).getPublicUrl(v);
        const publicUrl = (publicRes as any)?.data?.publicUrl ?? null;
        if (publicUrl) {
          if (mounted) setLogoUrl(publicUrl);
          return;
        }
        const signed = await sup.storage
          .from(BUCKET)
          .createSignedUrl(v, 60 * 60);
        const signedUrl = (signed as any)?.data?.signedUrl ?? null;
        if (signedUrl) {
          if (mounted) setLogoUrl(signedUrl);
          return;
        }
        if (mounted) setLogoUrl(null);
      } catch (err) {
        console.warn("Error resolving company logo URL", err);
        if (mounted) setLogoUrl(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [company?.logo]);

  // Resolve public URL for editForm logo or use preview
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (logoPreviewUrl) {
          if (mounted) setEditLogoUrl(logoPreviewUrl);
          return;
        }
        const v = editForm?.logo;
        if (!v) {
          if (mounted) setEditLogoUrl(null);
          return;
        }
        const s = String(v);
        if (s.startsWith("http")) {
          if (mounted) setEditLogoUrl(s);
          return;
        }
        const sup = (await import("../../lib/supabaseClient")).default;
        const BUCKET = "logo";
        const publicRes = await sup.storage.from(BUCKET).getPublicUrl(s);
        const publicUrl = (publicRes as any)?.data?.publicUrl ?? null;
        if (publicUrl) {
          if (mounted) setEditLogoUrl(publicUrl);
          return;
        }
        const signed = await sup.storage
          .from(BUCKET)
          .createSignedUrl(s, 60 * 60);
        const signedUrl = (signed as any)?.data?.signedUrl ?? null;
        if (signedUrl) {
          if (mounted) setEditLogoUrl(signedUrl);
          return;
        }
        if (mounted) setEditLogoUrl(null);
      } catch (err) {
        console.warn("Error resolving edit logo URL", err);
        if (mounted) setEditLogoUrl(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [editForm?.logo, logoPreviewUrl]);

  function startEdit() {
    setEditing(true);
    setEditForm(company || {});
  }
  function cancelEdit() {
    setEditing(false);
    try {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
        setLogoPreviewUrl(null);
      }
    } catch {}
    setEditForm(company || {});
    try {
      // Recargar la aplicación para que los cambios se reflejen globalmente
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    } catch {}
  }
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setEditForm((s: any) => ({ ...s, [name]: value }));
  }

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setEditForm((s: any) => ({ ...s, logoFile: f }));
    if (f) {
      try {
        const url = URL.createObjectURL(f);
        setLogoPreviewUrl(url);
      } catch {
        setLogoPreviewUrl(null);
      }
    } else {
      setLogoPreviewUrl(null);
    }
  }

  function getLogoSrc(useEdit = false) {
    const BUCKET = "logo";
    const SUP_URL =
      (import.meta.env.VITE_SUPABASE_URL as string) ||
      "https://sqwqlvsjtimallidxrsz.supabase.co";
    if (useEdit) {
      if (logoPreviewUrl) return logoPreviewUrl;
      const v = editForm?.logo;
      if (!v) return "/logo192.png";
      if (String(v).startsWith("http")) return String(v);
      let obj = String(v);
      if (obj.startsWith(`${BUCKET}/`)) obj = obj.slice(BUCKET.length + 1);
      return `${SUP_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(
        obj,
      )}`;
    }
    if (!company) return "/logo192.png";
    const v = company.logo;
    if (!v) return "/logo192.png";
    if (String(v).startsWith("http")) return String(v);
    let obj = String(v);
    if (obj.startsWith(`${BUCKET}/`)) obj = obj.slice(BUCKET.length + 1);
    return `${SUP_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(
      obj,
    )}`;
  }

  async function saveCompany() {
    try {
      const sup = (await import("../../lib/supabaseClient")).default;
      const payload = { ...(editForm || {}) };
      // handle logo file upload to Supabase storage bucket 'logo'
      let storedLogoPath: string | null = null;
      const getStoragePath = (img: string | null) => {
        if (!img) return null;
        if (!img.startsWith("http")) return img;
        const m = img.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.*)/);
        if (!m) return null;
        return decodeURIComponent(m[2]);
      };
      const oldImage = company?.logo ?? null;
      try {
        const file: File | null =
          editForm && editForm.logoFile instanceof File
            ? editForm.logoFile
            : null;
        const BUCKET = "logo";
        if (file) {
          const namePrefix =
            payload.id ??
            (crypto && (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : String(Date.now()));
          const filename = `logo/${namePrefix}/${Date.now()}_${file.name.replace(
            /[^a-zA-Z0-9.\-_/]/g,
            "_",
          )}`;
          const uploadRes = await sup.storage
            .from(BUCKET)
            .upload(filename, file, { upsert: true });
          if (uploadRes.error) throw uploadRes.error;
          const storedPath = (uploadRes as any).data?.path ?? filename;
          storedLogoPath = storedPath;
          payload.logo = storedPath;
        }
      } catch (err) {
        console.warn("Logo upload error", err);
      }
      // remove non-serializable file object before saving to DB
      try {
        if (payload.logoFile) delete payload.logoFile;
        // Remove pagina_web_integrada as it's not a DB column (localStorage only)
        if (payload.pagina_web_integrada) delete payload.pagina_web_integrada;
      } catch {}
      let result: any = null;
      try {
        if (company && company.id) {
          // Remove id from payload before update (GENERATED ALWAYS column)
          const toUpdate = { ...payload };
          delete toUpdate.id;
          const { data, error } = await sup
            .from("empresa")
            .update(toUpdate)
            .eq("id", company.id)
            .select("*");
          if (error) throw error;
          result = Array.isArray(data) ? (data[0] ?? null) : data;
        } else {
          const { data, error } = await sup
            .from("empresa")
            .insert(payload)
            .select("*");
          if (error) throw error;
          result = Array.isArray(data) ? (data[0] ?? null) : data;
        }
        // DB update succeeded: now remove old logo if we uploaded a new one
        try {
          if (storedLogoPath) {
            const oldPath = getStoragePath(oldImage);
            if (oldPath && oldPath !== storedLogoPath) {
              const BUCKET = "logo";
              const rm = await sup.storage.from(BUCKET).remove([oldPath]);
              if (rm.error)
                console.warn(
                  "Failed to remove old company logo after DB update",
                  rm.error,
                );
            }
          }
        } catch (rmErr) {
          console.warn("Error removing old logo after DB success", rmErr);
        }
      } catch (dbErr) {
        // If DB update failed but we uploaded a new logo, try to remove the uploaded logo to avoid orphan files
        try {
          if (storedLogoPath) {
            const BUCKET = "logo";
            const rm = await sup.storage.from(BUCKET).remove([storedLogoPath]);
            if (rm.error)
              console.warn(
                "Failed to remove uploaded logo after DB error",
                rm.error,
              );
          }
        } catch (rmErr) {
          console.warn("Error cleaning uploaded logo after DB failure", rmErr);
        }
        throw dbErr;
      }

      setCompany(result);
      setEditForm(result);
      try {
        console.debug("Empresa guardada, logo field:", result?.logo);
      } catch {}
      try {
        setLastSavedLogo(result?.logo ?? null);
      } catch {}
      // show modal confirmation
      try {
        setConfirmadoTitle("Datos guardados");
        setConfirmadoMessage(
          "Los datos de la empresa se guardaron correctamente.",
        );
        setConfirmadoOpen(true);
      } catch {}
      // Recargar la aplicación para que los cambios se reflejen globalmente
      try {
        if (typeof window !== "undefined" && window.location) {
          window.location.reload();
        }
      } catch {}
      // cleanup preview URL if any
      try {
        if (logoPreviewUrl) {
          URL.revokeObjectURL(logoPreviewUrl);
          setLogoPreviewUrl(null);
        }
      } catch {}
      try {
        localStorage.setItem("companyData", JSON.stringify(result));
      } catch {}
      setEditing(false);
    } catch (err: any) {
      console.error("Error guardando empresa en Supabase", err);
      try {
        setLastSaveError(err?.message || String(err));
      } catch {}
      // Save payload locally (without File objects) so user can retry later
      try {
        const payloadToStore = { ...(editForm || {}) };
        // remove file objects which cannot be serialized
        if (payloadToStore.logoFile) {
          delete payloadToStore.logoFile;
        }
        const needsLogo = Boolean(
          editForm && editForm.logoFile instanceof File,
        );
        localStorage.setItem(
          "pendingCompanySave",
          JSON.stringify({
            payload: payloadToStore,
            needsLogo,
            ts: Date.now(),
          }),
        );
        setPendingSave(true);
        setPendingPayload(payloadToStore);
        setPendingNeedsLogo(needsLogo);
        setCompany(editForm);
        try {
          localStorage.setItem("companyData", JSON.stringify(editForm));
        } catch {}
        setEditing(false);
        // show modal for local save notice as well
        setConfirmadoTitle("Guardado localmente");
        setConfirmadoMessage(
          "Los datos se guardaron localmente porque no se pudo alcanzar Supabase. Puedes reintentar cuando tengas conexión.",
        );
        setConfirmadoOpen(true);
      } catch (e) {
        console.error("Error saving locally", e);
      }
    }
  }

  async function resendPending() {
    const pending = pendingPayload;
    if (!pending) {
      setConfirmadoTitle("Sin pendientes");
      setConfirmadoMessage("No hay datos pendientes para enviar");
      setConfirmadoOpen(true);
      return;
    }
    try {
      const sup = (await import("../../lib/supabaseClient")).default;
      let result: any = null;
      if (pending.id) {
        // Remove id from payload before update (GENERATED ALWAYS column)
        const toUpdate = { ...pending };
        delete toUpdate.id;
        const { data, error } = await sup
          .from("empresa")
          .update(toUpdate)
          .eq("id", pending.id)
          .select("*");
        if (error) throw error;
        result = Array.isArray(data) ? (data[0] ?? null) : data;
      } else {
        const { data, error } = await sup
          .from("empresa")
          .insert(pending)
          .select("*");
        if (error) throw error;
        result = Array.isArray(data) ? (data[0] ?? null) : data;
      }
      // success: clear pending
      localStorage.removeItem("pendingCompanySave");
      setPendingSave(false);
      setPendingPayload(null);
      setPendingNeedsLogo(false);
      setCompany(result);
      setEditForm(result);
      setConfirmadoTitle("Sincronizado");
      setConfirmadoMessage(
        "Los datos pendientes se sincronizaron con Supabase correctamente.",
      );
      setConfirmadoOpen(true);
      // Recargar la aplicación para que los cambios se reflejen globalmente
      try {
        if (typeof window !== "undefined" && window.location) {
          window.location.reload();
        }
      } catch {}
    } catch (err: any) {
      console.error("Error reenviando datos pendientes", err);
      setConfirmadoTitle("Error al reenviar");
      setConfirmadoMessage(
        "No se pudo reenviar los datos a Supabase: " +
          (err?.message || String(err)),
      );
      setConfirmadoOpen(true);
    }
  }

  function discardPending() {
    try {
      localStorage.removeItem("pendingCompanySave");
      setPendingSave(false);
      setPendingPayload(null);
      setPendingNeedsLogo(false);
      setConfirmadoTitle("Pendiente descartado");
      setConfirmadoMessage("El guardado pendiente fue descartado.");
      setConfirmadoOpen(true);
    } catch {}
  }

  function resetToJson() {
    fetch("/data-base/company.json")
      .then((r) => r.json())
      .then((d) => {
        setCompany(d);
        setEditForm(d);
        localStorage.removeItem("companyData");
      })
      .catch(() => {});
  }

  async function handleCheckUpdates() {
    setCheckingUpdates(true);
    try {
      const { hasUpdate, versionInfo } = await checkForUpdatesManually();

      if (hasUpdate && versionInfo) {
        const confirmUpdate = window.confirm(
          `🚀 Nueva versión disponible: v${versionInfo.version}\n\n` +
            `${versionInfo.changelog}\n\n` +
            `¿Desea actualizar ahora? La aplicación se recargará.`,
        );

        if (confirmUpdate) {
          await performUpdate(versionInfo.version);
        }
      } else {
        setConfirmadoTitle("✅ Sistema actualizado");
        setConfirmadoMessage(
          `Estás usando la versión más reciente${
            versionInfo ? `: v${versionInfo.version}` : ""
          }`,
        );
        setConfirmadoOpen(true);
      }
    } catch (error) {
      setConfirmadoTitle("⚠️ Error");
      setConfirmadoMessage(
        "No se pudo verificar actualizaciones. Intenta más tarde.",
      );
      setConfirmadoOpen(true);
    } finally {
      setCheckingUpdates(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Datos de mi empresa</h2>

      {/* Check for Updates Button */}
      <div
        style={{
          background: "#fff",
          padding: 18,
          borderRadius: 8,
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(2,6,23,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: 4 }}>
            🔄 Actualizaciones de la aplicación
          </div>
          <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
            Verifica si hay una nueva versión disponible
          </div>
        </div>
        <button
          onClick={handleCheckUpdates}
          disabled={checkingUpdates}
          style={{
            padding: "10px 20px",
            background: checkingUpdates
              ? "#cbd5e1"
              : "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: checkingUpdates ? "not-allowed" : "pointer",
            boxShadow: checkingUpdates
              ? "none"
              : "0 2px 8px rgba(59, 130, 246, 0.3)",
            transition: "all 150ms",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            if (!checkingUpdates) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(59, 130, 246, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = checkingUpdates
              ? "none"
              : "0 2px 8px rgba(59, 130, 246, 0.3)";
          }}
        >
          {checkingUpdates ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255, 255, 255, 0.3)",
                  borderTopColor: "white",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Verificando...
            </>
          ) : (
            "Buscar actualizaciones"
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {companyLoading ? (
        <div>Cargando datos de la empresa...</div>
      ) : !company ? (
        <div>No se encontraron datos de la empresa.</div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div
            style={{
              background: "#fff",
              padding: 18,
              borderRadius: 8,
              minWidth: 420,
              boxShadow: "0 1px 3px rgba(2,6,23,0.06)",
            }}
          >
            {pendingSave ? (
              <div
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fbbf24",
                  padding: 8,
                  borderRadius: 6,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <strong>Guardado localmente:</strong> Los datos no se
                    sincronizaron con Supabase.
                    {lastSaveError ? (
                      <div style={{ fontSize: 12, color: "#b91c1c" }}>
                        Error: {String(lastSaveError)}
                      </div>
                    ) : null}
                    {pendingNeedsLogo ? (
                      <div style={{ fontSize: 12, color: "#92400e" }}>
                        Nota: el archivo de logo no se incluyó y deberá subirse
                        de nuevo.
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={resendPending}>
                      Reintentar guardar en Supabase
                    </button>
                    <button className="btn-opaque" onClick={discardPending}>
                      Descartar pendiente
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {lastSavedLogo ? (
              <div style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>Logo guardado:</strong>
                <div style={{ marginTop: 6 }}>
                  <a
                    href={getLogoSrc(false)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir logo
                  </a>
                  <div style={{ color: "#374151", fontSize: 12 }}>
                    {String(lastSavedLogo)}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 120,
                  height: 60,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f1f5f9",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <img
                  src={
                    editing
                      ? (editLogoUrl ?? getLogoSrc(true))
                      : (logoUrl ?? getLogoSrc(false))
                  }
                  alt="logo"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              {editing ? (
                <input
                  name="nombre"
                  value={editForm.nombre || ""}
                  onChange={handleChange}
                  className="input"
                  placeholder="Nombre del negocio"
                  style={{ fontSize: 18, fontWeight: 600, padding: 6 }}
                />
              ) : (
                <h3 style={{ marginTop: 0 }}>{company.nombre}</h3>
              )}
            </div>
            <div style={{ marginTop: 20, color: "#334155" }}>
              {editing ? (
                /* ── Modo edición: grid de 2 columnas ── */
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "16px 24px",
                  }}
                >
                  {/* RTN */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      RTN
                    </label>
                    <input
                      name="rtn"
                      value={editForm.rtn || ""}
                      onChange={handleChange}
                      className="input"
                      placeholder="RTN de la empresa"
                    />
                  </div>
                  {/* Teléfono */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Teléfono
                    </label>
                    <input
                      name="telefono"
                      value={editForm.telefono || ""}
                      onChange={handleChange}
                      className="input"
                      placeholder="Número de teléfono"
                    />
                  </div>
                  {/* Correo */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Correo electrónico
                    </label>
                    <input
                      name="email"
                      value={editForm.email || ""}
                      onChange={handleChange}
                      className="input"
                      placeholder="correo@empresa.com"
                    />
                  </div>
                  {/* Logo URL */}
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Logo (URL)
                    </label>
                    <input
                      name="logo"
                      value={editForm.logo || ""}
                      onChange={handleChange}
                      className="input"
                      placeholder="https://.../logo.png"
                    />
                  </div>
                  {/* Dirección — ocupa las 2 columnas */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Dirección
                    </label>
                    <textarea
                      name="direccion"
                      value={editForm.direccion || ""}
                      onChange={handleChange}
                      className="input"
                      placeholder="Dirección completa"
                      style={{ minHeight: 64, resize: "vertical" }}
                    />
                  </div>
                  {/* Logo archivo — ocupa las 2 columnas */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      gridColumn: "1 / -1",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#64748b",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Subir archivo de logo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoFileChange}
                    />
                  </div>
                  {logoPreviewUrl && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "#64748b",
                          margin: "0 0 6px",
                        }}
                      >
                        Vista previa:
                      </p>
                      <div
                        style={{
                          width: 160,
                          height: 60,
                          background: "#fff",
                          border: "1px solid #e2e8f0",
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <img
                          src={logoPreviewUrl}
                          alt="preview"
                          style={{
                            maxWidth: "100%",
                            maxHeight: "100%",
                            objectFit: "contain",
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Modo vista: tabla de valores ── */
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "10px 20px",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    RTN
                  </span>
                  <span style={{ color: "#1e293b" }}>
                    {company.rtn || <em style={{ color: "#94a3b8" }}>—</em>}
                  </span>

                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Teléfono
                  </span>
                  <span style={{ color: "#1e293b" }}>
                    {company.telefono || (
                      <em style={{ color: "#94a3b8" }}>—</em>
                    )}
                  </span>

                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Correo
                  </span>
                  <span style={{ color: "#1e293b" }}>
                    {company.email || <em style={{ color: "#94a3b8" }}>—</em>}
                  </span>

                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Dirección
                  </span>
                  <span style={{ color: "#1e293b" }}>
                    {company.direccion || (
                      <em style={{ color: "#94a3b8" }}>—</em>
                    )}
                  </span>

                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Logo
                  </span>
                  <span style={{ color: "#1e293b" }}>
                    {company.logo ? (
                      "URL configurada"
                    ) : (
                      <em style={{ color: "#94a3b8" }}>Sin logo</em>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={saveCompany}
                    className="btn-primary"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="btn-opaque"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="btn-primary"
                  >
                    Actualizar datos
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 320 }}>
            <div
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 220,
                  height: 90,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f1f5f9",
                  borderRadius: 8,
                  overflow: "hidden",
                  marginBottom: 12,
                }}
              >
                <img
                  src={
                    editing
                      ? (editLogoUrl ?? getLogoSrc(true))
                      : (logoUrl ?? getLogoSrc(false))
                  }
                  alt="logo"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
              <h4 style={{ margin: 0, marginBottom: 8 }}>Detalles rápidos</h4>
              <p style={{ margin: 0 }}>
                RTN: <strong>{company.rtn}</strong>
              </p>
              <p style={{ margin: 0 }}>
                Teléfono: <strong>{company.telefono}</strong>
              </p>
              <p style={{ marginTop: 8 }}>
                Correo: <strong>{company.email}</strong>
              </p>
              <p style={{ marginTop: 8 }}>
                Dirección: <strong>{company.direccion}</strong>
              </p>
            </div>
          </div>
        </div>
      )}
      <Confirmado
        open={confirmadoOpen}
        title={confirmadoTitle}
        message={confirmadoMessage}
        onClose={() => setConfirmadoOpen(false)}
      />
    </div>
  );
}
