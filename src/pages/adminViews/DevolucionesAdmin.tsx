import React from "react";
import DevolucionCaja from "../DevolucionCaja";

/**
 * Wrapper que expone DevolucionCaja dentro del Panel de Administración.
 * onBack se deja vacío porque la navegación la gestiona el PanelAdmin.
 */
export default function DevolucionesAdmin() {
  return <DevolucionCaja onBack={() => {}} />;
}
