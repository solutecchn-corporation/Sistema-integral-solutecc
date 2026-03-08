import React, { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import Confirmado from "../../components/Confirmado";

type WebUser = {
  id?: number;
  username?: string;
  email?: string;
  nombre?: string;
  password?: string;
  estado?: string;
  created_at?: string;
  [key: string]: any;
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 5,
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  fontSize: "0.9rem",
  boxSizing: "border-box" as const,
  background: "white",
};

export default function UsuariosWeb() {
  const [users, setUsers] = useState<WebUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [editUser, setEditUser] = useState<WebUser | null>(null);
  const [editForm, setEditForm] = useState<WebUser>({});
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("usuarios_web")
        .select("*")
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw error;
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(s) ||
      (u.email || "").toLowerCase().includes(s) ||
      (u.nombre || "").toLowerCase().includes(s)
    );
  });

  function openEdit(user: WebUser) {
    setEditUser(user);
    setEditForm({ ...user });
    setEditPassword("");
    setSaveError(null);
  }

  function closeEdit() {
    setEditUser(null);
    setEditForm({});
    setEditPassword("");
    setSaveError(null);
  }

  async function handleSave() {
    if (!editUser?.id) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: any = {
        username: editForm.username,
        email: editForm.email,
        nombre: editForm.nombre,
        estado: editForm.estado,
      };
      if (editPassword.trim()) payload.password = editPassword.trim();
      const { error } = await supabase
        .from("usuarios_web")
        .update(payload)
        .eq("id", editUser.id);
      if (error) throw error;
      closeEdit();
      setConfirmOpen(true);
      await loadUsers();
    } catch (err: any) {
      setSaveError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const thStyle: React.CSSProperties = {
    padding: "11px 16px",
    textAlign: "left",
    fontWeight: 700,
    color: "#374151",
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    color: "#334155",
    fontSize: "0.875rem",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2
          style={{
            margin: 0,
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          Usuarios Web
        </h2>
        <p
          style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.875rem" }}
        >
          Tabla:{" "}
          <code
            style={{
              background: "#f1f5f9",
              padding: "1px 6px",
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            usuarios_web
          </code>
        </p>
      </div>

      {/* Toolbar */}
      <div
        style={{
          background: "white",
          padding: "14px 18px",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          marginBottom: 18,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Buscar por usuario, email o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 240,
            padding: "8px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: 7,
            fontSize: "0.875rem",
          }}
        />
        <button
          onClick={loadUsers}
          disabled={loading}
          style={{
            padding: "8px 16px",
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 7,
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "#334155",
            cursor: "pointer",
          }}
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
        <span
          style={{ color: "#64748b", fontSize: "0.85rem", marginLeft: "auto" }}
        >
          <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>{" "}
          registro{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            color: "#b91c1c",
            padding: "11px 16px",
            borderRadius: 8,
            marginBottom: 14,
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "white",
          borderRadius: 10,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "#f8fafc",
                  borderBottom: "2px solid #e2e8f0",
                }}
              >
                <th style={thStyle}>Usuario</th>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Correo</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Registro</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 16px",
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    Cargando...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 16px",
                      textAlign: "center",
                      color: "#94a3b8",
                    }}
                  >
                    {search
                      ? "Sin resultados para la búsqueda"
                      : "No hay usuarios web registrados"}
                  </td>
                </tr>
              ) : (
                filtered.map((user, idx) => (
                  <tr
                    key={user.id ?? idx}
                    style={{ borderBottom: "1px solid #f1f5f9" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f8fafc")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <td
                      style={{ ...tdStyle, fontWeight: 600, color: "#1e293b" }}
                    >
                      {user.username || "-"}
                    </td>
                    <td style={tdStyle}>{user.nombre || "-"}</td>
                    <td style={tdStyle}>{user.email || "-"}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          background:
                            user.estado === "activo" || !user.estado
                              ? "#dcfce7"
                              : "#f1f5f9",
                          color:
                            user.estado === "activo" || !user.estado
                              ? "#15803d"
                              : "#475569",
                          border: `1px solid ${user.estado === "activo" || !user.estado ? "#bbf7d0" : "#e2e8f0"}`,
                        }}
                      >
                        {user.estado || "activo"}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: "0.8rem",
                        color: "#64748b",
                      }}
                    >
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString("es-HN")
                        : "-"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button
                        onClick={() => openEdit(user)}
                        style={{
                          padding: "5px 14px",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          borderRadius: 6,
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 28,
              width: "90%",
              maxWidth: 500,
              boxShadow: "0 20px 60px rgba(2,6,23,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
                paddingBottom: 14,
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Editar usuario web
              </h3>
              <button
                onClick={closeEdit}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 22,
                  color: "#94a3b8",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {saveError && (
              <div
                style={{
                  background: "#fee2e2",
                  color: "#b91c1c",
                  padding: "10px 14px",
                  borderRadius: 7,
                  marginBottom: 14,
                  fontSize: "0.875rem",
                }}
              >
                {saveError}
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={LABEL}>Usuario</label>
                <input
                  type="text"
                  value={editForm.username || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, username: e.target.value }))
                  }
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Nombre completo</label>
                <input
                  type="text"
                  value={editForm.nombre || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Correo electrónico</label>
                <input
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL}>Estado</label>
                <select
                  value={editForm.estado || "activo"}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, estado: e.target.value }))
                  }
                  style={INPUT}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
              <div>
                <label style={LABEL}>
                  Nueva contraseña{" "}
                  <span
                    style={{
                      textTransform: "none",
                      fontWeight: 400,
                      color: "#94a3b8",
                    }}
                  >
                    (vacío = sin cambio)
                  </span>
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="••••••••"
                  style={INPUT}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 22,
                paddingTop: 16,
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                onClick={closeEdit}
                style={{
                  padding: "9px 20px",
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "9px 20px",
                  background: "#1e40af",
                  color: "white",
                  border: "none",
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Confirmado
        open={confirmOpen}
        title="Usuario actualizado"
        message="Los cambios se guardaron correctamente."
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
