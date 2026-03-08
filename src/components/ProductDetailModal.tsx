import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  data: any;
  title?: string;
  onClose: () => void;
  onEdit: (row: any) => void;
  onDeleteClick: (id: any) => void;
};

export default function ProductDetailModal({
  open,
  data,
  title = "Detalle",
  onClose,
  onEdit,
  onDeleteClick,
}: Props) {
  if (!open) return null;

  const rows = data || {};
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [urlCheck, setUrlCheck] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      const src = typeof rows.imagen === "string" ? rows.imagen : null;
      if (!src) {
        if (mounted) setImgSrc(null);
        return;
      }
      // If already a full URL, use it
      if (src.startsWith("http")) {
        if (mounted) {
          setImgSrc(src);
          setResolvedUrl(src);
        }
        return;
      }
      // Normalize possible storage path that contains the public object URL
      // e.g. "/storage/v1/object/public/<BUCKET>/path/to/file.png"
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
        const publicRes = await sup.storage
          .from(BUCKET)
          .getPublicUrl(objectPath);
        const publicUrl =
          (publicRes as any)?.data?.publicUrl ||
          (publicRes as any)?.data?.publicURL ||
          null;
        if (publicUrl) {
          if (mounted) {
            setImgSrc(publicUrl);
            setResolvedUrl(publicUrl);
          }
          return;
        }
        const signed = await sup.storage
          .from(BUCKET)
          .createSignedUrl(objectPath, 60 * 60 * 24 * 7);
        if (signed.error) {
          console.warn(
            "ProductDetailModal createSignedUrl error",
            signed.error
          );
          if (mounted) setImgSrc(null);
          return;
        }
        const url = (signed.data as any)?.signedUrl ?? null;
        if (mounted) {
          setImgSrc(url);
          setResolvedUrl(url);
        }
      } catch (err) {
        console.error("ProductDetailModal resolve error", err);
        if (mounted) setImgSrc(null);
      }
    };
    resolve();
    return () => {
      mounted = false;
    };
  }, [rows]);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      setUrlCheck(null);
      if (!resolvedUrl) return;
      try {
        const res = await fetch(resolvedUrl, { method: "HEAD" });
        if (!mounted) return;
        setUrlCheck(
          `HEAD ${res.status} ${
            res.statusText
          } - content-type: ${res.headers.get("content-type")}`
        );
      } catch (err: any) {
        if (!mounted) return;
        setUrlCheck(`FETCH_ERROR: ${String(err)}`);
      }
    };
    check();
    return () => {
      mounted = false;
    };
  }, [resolvedUrl]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: 18,
          borderRadius: 8,
          width: 760,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{title}</h3>

        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%" }}>
              <tbody>
                {Object.keys(rows).map((k) => {
                  const v = rows[k];
                  if (k === "imagen" && typeof v === "string") return null;
                  // Ocultar campos de impuestos y codigo de barras
                  if (
                    k === "aplica_impuesto_18" ||
                    k === "aplica_impuesto_turistico" ||
                    k === "codigo_barras"
                  )
                    return null;
                  const label =
                    k === "sku"
                      ? "CODIGO"
                      : String(k).replace(/_/g, " ").toUpperCase();
                  return (
                    <tr key={k}>
                      <td style={{ fontWeight: 700, padding: 6, width: 160 }}>
                        {label}
                      </td>
                      <td style={{ padding: 6 }}>{String(v ?? "-")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ width: 280, textAlign: "center" }}>
            {imgSrc ? (
              <img
                src={encodeURI(imgSrc)}
                alt="imagen"
                style={{ maxWidth: 260, maxHeight: 260, objectFit: "contain" }}
                onError={(e) => {
                  console.warn("Image load failed for", imgSrc);
                  // keep the failed URL so we can show a fallback with a link
                  setFailedUrl(imgSrc);
                  setImgSrc(null);
                }}
              />
            ) : failedUrl ? (
              <div
                style={{
                  width: 260,
                  height: 200,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fff5f5",
                  color: "#b91c1c",
                  border: "1px dashed #fca5a5",
                  padding: 8,
                }}
              >
                <div style={{ marginBottom: 8, fontWeight: 700 }}>
                  Error cargando imagen
                </div>
                <a
                  href={failedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#b91c1c", wordBreak: "break-all" }}
                >
                  Abrir imagen
                </a>
              </div>
            ) : (
              <div
                style={{
                  width: 260,
                  height: 200,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#f3f4f6",
                  color: "#6b7280",
                }}
              >
                Sin imagen
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="btn-opaque"
            onClick={() => onEdit(rows)}
          >
            Editar
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => onDeleteClick(rows.id)}
          >
            Eliminar
          </button>
          <button type="button" className="btn-opaque" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    (typeof document !== "undefined" && document.body) ||
      document.createElement("div")
  );
}
