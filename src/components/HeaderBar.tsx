import React, { useState, useRef, useEffect } from "react";
import getCompanyData from "../lib/getCompanyData";

type Props = {
  userName?: string | null;
  userRole?: string | null;
  userId?: number | string | null;
  caiInfo?: {
    cai?: string | null;
    rango_de?: string | null;
    rango_hasta?: string | null;
    fecha_vencimiento?: string | null;
    secuencia_actual?: string | null;
  } | null;
  onOpenDatosFactura?: () => void;
  onLogout: () => void;
  onNavigate: (view: string | null) => void;
  onPrintFormatChange?: (fmt: "carta" | "cinta") => void;
  onOpenCajaConfig?: () => void;
  printFormat?: "carta" | "cinta";
};

export default function HeaderBar({
  userName,
  userRole,
  userId,
  caiInfo,
  onOpenDatosFactura,
  onLogout,
  onNavigate,
  onPrintFormatChange,
  onOpenCajaConfig,
  printFormat,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  useEffect(() => {
    // Try to resolve a friendly display name for the current user.
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw as string) as any;
        const candidate =
          u?.name ||
          u?.full_name ||
          u?.user?.name ||
          u?.user?.full_name ||
          u?.user?.user_metadata?.full_name ||
          u?.user?.user_metadata?.name ||
          u?.username ||
          null;
        if (candidate) setDisplayName(String(candidate));
      }
    } catch {}
  }, [userName]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const company = await getCompanyData();
        if (!mounted || !company) return;
        const name = company.nombre || company.comercio || company.name || null;
        const logo = company.logoUrl || company.logo || null;
        if (name) setCompanyName(String(name));
        if (logo) setCompanyLogo(String(logo));
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <style>{`
        .pv-zoom-modal { animation: pv-zoom-in 220ms ease-out both; transform-origin: center; }
        @keyframes pv-zoom-in {
          from { opacity: 0; transform: scale(0.96) translateY(-6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .pv-backdrop { background: rgba(2,6,23,0.6); }
        .pv-logout-title { font-size: 1.05rem; font-weight: 800; }
        .pv-logout-body { color: #334155; margin-top: 6px; margin-bottom: 10px; }
        
        /* Responsivo para tablets */
        @media (max-width: 1024px) {
          .pv-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 100 !important;
            padding: 10px 14px !important;
          }
          .pv-header-title {
            font-size: 0.9rem !important;
          }
          .pv-header-username {
            font-size: 0.8rem !important;
          }
          .pv-header-logo {
            width: 32px !important;
            height: 32px !important;
          }
        }
        @media (max-width: 768px) {
          .pv-header {
            padding: 8px 12px !important;
          }
          .pv-header-title {
            font-size: 0.85rem !important;
          }
          .pv-header-center {
            display: none !important;
          }
        }
      `}</style>
      <header
        className="pv-header"
        style={{
          background: "#1e293b",
          color: "white",
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {companyLogo ? (
            <img
              src={companyLogo}
              alt="logo"
              className="pv-header-logo"
              style={{
                width: 40,
                height: 40,
                objectFit: "contain",
                borderRadius: 6,
              }}
            />
          ) : null}
          <div
            className="pv-header-title"
            style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}
          >
            {companyName ? companyName : "Punto de Ventas"}
          </div>
        </div>
        <div
          className="pv-header-center"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div
            className="pv-header-username"
            style={{ fontSize: "0.95rem", color: "#e2e8f0", fontWeight: 500 }}
          >
            {displayName || (userName ? `${userName}` : "")}
          </div>
          {/* CAI moved to DatosFacturaModal; header no longer shows detailed CAI */}
        </div>

        <div style={{ position: "relative" }} ref={ref}>
          {/* Impresión moved to CajaConfigModal; control hidden from header */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="btn-opaque"
            style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Menu ▾
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                marginTop: 8,
                background: "white",
                color: "#0b1724",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(2,6,23,0.16)",
                minWidth: 220,
                zIndex: 60,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenDatosFactura && onOpenDatosFactura();
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Datos de factura
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCajaConfig && onOpenCajaConfig();
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Configuración de caja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("CotizacionesGuardadas");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Cotizaciones guardadas
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("PedidosEnLinea");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Pedidos en línea
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("IngresoEfectivo");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Movimientos de caja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("DevolucionCaja");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Devolución de caja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("CorteCajaParcial");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Corte de caja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("AnulacionFactura");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Anulación de factura
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigate("HistorialVentas");
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Historial de ventas
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setLogoutConfirmOpen(true);
                }}
                className="btn-opaque"
                style={{
                  width: "100%",
                  background: "transparent",
                  color: "#0b1724",
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                Cerrar Sesión
              </button>
            </div>
          )}
          {logoutConfirmOpen && (
            <div
              role="dialog"
              aria-modal="true"
              className="pv-backdrop"
              style={{
                position: "fixed",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 12000,
              }}
              onClick={() => setLogoutConfirmOpen(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="pv-zoom-modal"
                style={{
                  width: 380,
                  background: "white",
                  borderRadius: 10,
                  padding: 18,
                  boxShadow: "0 18px 40px rgba(2,6,23,0.35)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div>
                    <div className="pv-logout-title">
                      Confirmar cierre de sesión
                    </div>
                    <div className="pv-logout-body"> ¿Deseas continuar?</div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <button
                    onClick={() => setLogoutConfirmOpen(false)}
                    className="btn-opaque"
                    style={{
                      background: "transparent",
                      padding: "8px 12px",
                      borderRadius: 8,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setLogoutConfirmOpen(false);
                      try {
                        onLogout();
                      } catch (e) {}
                    }}
                    className="btn-opaque"
                    style={{
                      background: "#ef4444",
                      color: "white",
                      padding: "8px 12px",
                      borderRadius: 8,
                    }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
