import React, { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import Confirmado from "../components/Confirmado";
import UsuarioModal from "../components/UsuarioModal";

export default function UsuariosCajeros() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);

  // Delete confirmation modal
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>("");
  const [adminPassword, setAdminPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, username, role, nombre_usuario")
        .order("id", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || String(err));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveUser(data: {
    username: string;
    password?: string;
    nombre_usuario: string;
    role: string;
  }) {
    // --- Validaciones de seguridad ---
    const rawUser = localStorage.getItem("user");
    const currentUser = rawUser ? JSON.parse(rawUser) : null;
    const currentUserId = currentUser?.id;

    if (editUser) {
      // 1. El admin no puede degradar su propio rol
      if (editUser.id === currentUserId && data.role !== "admin") {
        throw new Error(
          "No puedes cambiar tu propio rol de administrador. Permanece como admin o pide a otro administrador que lo haga.",
        );
      }
      // 2. No puede cambiarse el rol del último administrador
      if (editUser.role === "admin" && data.role !== "admin") {
        const adminCount = users.filter((u) => u.role === "admin").length;
        if (adminCount <= 1) {
          throw new Error(
            "No se puede cambiar el rol del único administrador del sistema. Debe existir al menos un administrador activo.",
          );
        }
      }
    }
    // --- Fin validaciones ---

    setLoading(true);
    try {
      if (editUser) {
        // Update existing user
        const payload: any = {
          username: data.username,
          nombre_usuario: data.nombre_usuario,
          role: data.role,
        };
        if (data.password) {
          payload.password = data.password;
        }
        const { error } = await supabase
          .from("users")
          .update(payload)
          .eq("id", editUser.id);
        if (error) throw error;
      } else {
        // Create new user
        const payload: any = {
          username: data.username,
          password: data.password,
          nombre_usuario: data.nombre_usuario,
          role: data.role,
        };
        const { error } = await supabase.from("users").insert(payload);
        if (error) throw error;
      }
      await loadUsers();
      setModalOpen(false);
      setEditUser(null);
    } catch (err: any) {
      throw new Error(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditUser(null);
    setModalOpen(true);
  }

  function openEditModal(user: any) {
    setEditUser(user);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditUser(null);
  }

  function openDeleteConfirm(id: number, username: string, role: string) {
    if (role !== "cajero") {
      setErrorMessage('Solo se pueden eliminar usuarios con rol "cajero"');
      setErrorOpen(true);
      return;
    }
    setConfirmDeleteId(id);
    setConfirmDeleteName(username);
    setAdminPassword("");
    setPasswordError(null);
    setConfirmDeleteOpen(true);
  }

  async function performDeleteUser() {
    if (confirmDeleteId == null) return;
    if (!adminPassword.trim()) {
      setPasswordError("Ingrese la contraseña de administrador");
      return;
    }

    setVerifyingPassword(true);
    setPasswordError(null);

    try {
      // Get current admin user from localStorage
      const rawUser = localStorage.getItem("user");
      if (!rawUser) {
        setPasswordError("No se encontró sesión de administrador");
        return;
      }

      const currentUser = JSON.parse(rawUser);
      const currentUsername =
        currentUser?.username || currentUser?.user?.username;

      if (!currentUsername) {
        setPasswordError("No se pudo verificar el usuario actual");
        return;
      }

      // Verify admin password
      const { data: verifyData, error: verifyError } = await supabase
        .from("users")
        .select("id, role, password")
        .eq("username", currentUsername)
        .single();

      if (verifyError || !verifyData) {
        setPasswordError("Error al verificar credenciales");
        return;
      }

      if (verifyData.role !== "admin") {
        setPasswordError("Solo administradores pueden eliminar usuarios");
        return;
      }

      // Simple password comparison (in production, use proper hashing)
      if (verifyData.password !== adminPassword) {
        setPasswordError("Contraseña incorrecta");
        return;
      }

      // Password verified, proceed with deletion
      setLoading(true);
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", confirmDeleteId);

      if (error) throw error;

      await loadUsers();
      setConfirmDeleteOpen(false);
      setAdminPassword("");
      setSuccessOpen(true);
    } catch (err: any) {
      setPasswordError(err?.message || String(err));
    } finally {
      setVerifyingPassword(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadUsers();
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = users.filter((u) => {
    // Filter by role
    if (filterRole !== "all" && u.role !== filterRole) return false;
    // Filter by search
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(s) ||
      (String(u.id) || "").includes(s) ||
      (u.role || "").toLowerCase().includes(s) ||
      (u.nombre_usuario || "").toLowerCase().includes(s)
    );
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" };
      case "cajero":
        return { bg: "#dcfce7", color: "#166534", border: "#86efac" };
      default:
        return { bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
    }
  };

  return (
    <>
      <style>{`
        .usuarios-container {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          background: #f8fafc;
          min-height: 100vh;
        }
        .usuarios-header {
          margin-bottom: 24px;
        }
        .usuarios-title {
          font-size: 1.75rem;
          font-weight: 800;
          color: #1e293b;
          margin: 0 0 8px 0;
        }
        .usuarios-subtitle {
          color: #64748b;
          font-size: 0.95rem;
          margin: 0;
        }
        .usuarios-toolbar {
          background: white;
          padding: 20px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          margin-bottom: 24px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .usuarios-search {
          flex: 1;
          min-width: 250px;
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.95rem;
          transition: border-color 150ms, box-shadow 150ms;
        }
        .usuarios-search:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .usuarios-filter-select {
          padding: 10px 14px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.95rem;
          background: white;
          cursor: pointer;
          min-width: 150px;
        }
        .usuarios-btn {
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms;
          border: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .usuarios-btn-primary {
          background: #3b82f6;
          color: white;
        }
        .usuarios-btn-primary:hover {
          background: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
        .usuarios-btn-secondary {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #cbd5e1;
        }
        .usuarios-btn-secondary:hover {
          background: #e2e8f0;
        }
        .usuarios-stats {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 0.9rem;
        }
        .usuarios-stats-number {
          font-weight: 700;
          color: #1e293b;
          font-size: 1.1rem;
        }
        .usuarios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }
        .usuario-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          transition: all 200ms;
          border: 1px solid #e2e8f0;
        }
        .usuario-card:hover {
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }
        .usuario-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .usuario-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 1.2rem;
        }
        .usuario-info {
          flex: 1;
          margin-left: 14px;
        }
        .usuario-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 4px 0;
        }
        .usuario-username {
          color: #64748b;
          font-size: 0.875rem;
          margin: 0;
        }
        .usuario-badge {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .usuario-card-footer {
          display: flex;
          gap: 8px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #f1f5f9;
        }
        .usuario-card-btn {
          flex: 1;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 150ms;
          border: none;
          text-align: center;
        }
        .usuario-card-btn-edit {
          background: #f1f5f9;
          color: #334155;
        }
        .usuario-card-btn-edit:hover {
          background: #e2e8f0;
        }
        .usuario-card-btn-delete {
          background: #fee2e2;
          color: #b91c1c;
        }
        .usuario-card-btn-delete:hover {
          background: #fca5a5;
        }
        .usuario-card-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .usuarios-empty {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .usuarios-empty-icon {
          font-size: 3rem;
          margin-bottom: 16px;
          opacity: 0.3;
        }
        .usuarios-empty-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }
        .usuarios-empty-text {
          color: #64748b;
          margin-bottom: 20px;
        }
        @media (max-width: 768px) {
          .usuarios-container {
            padding: 16px;
          }
          .usuarios-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .usuarios-search,
          .usuarios-filter-select {
            width: 100%;
          }
          .usuarios-stats {
            margin-left: 0;
            justify-content: center;
          }
          .usuarios-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="usuarios-container">
        <div className="usuarios-header">
          <h1 className="usuarios-title">👥 Usuarios del Sistema</h1>
          <p className="usuarios-subtitle">
            Gestiona los usuarios y cajeros del sistema
          </p>
        </div>

        <div className="usuarios-toolbar">
          <input
            type="text"
            placeholder="🔍 Buscar usuario, nombre o ID..."
            className="usuarios-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="usuarios-filter-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">Todos los roles</option>
            <option value="admin">Administradores</option>
            <option value="cajero">Cajeros</option>
          </select>

          <button
            className="usuarios-btn usuarios-btn-secondary"
            onClick={() => loadUsers()}
            disabled={loading}
          >
            🔄 Recargar
          </button>

          <button
            className="usuarios-btn usuarios-btn-primary"
            onClick={openCreateModal}
          >
            ➕ Nuevo Usuario
          </button>

          <div className="usuarios-stats">
            <span className="usuarios-stats-number">{filtered.length}</span>
            <span>usuario{filtered.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#b91c1c",
              padding: "14px 16px",
              borderRadius: "8px",
              marginBottom: "20px",
              fontSize: "0.95rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {loading && filtered.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "white",
              borderRadius: "12px",
              color: "#64748b",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
            <div>Cargando usuarios...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="usuarios-empty">
            <div className="usuarios-empty-icon">👤</div>
            <div className="usuarios-empty-title">No hay usuarios</div>
            <div className="usuarios-empty-text">
              {search || filterRole !== "all"
                ? "No se encontraron resultados para tu búsqueda"
                : "Comienza creando tu primer usuario"}
            </div>
            {!search && filterRole === "all" && (
              <button
                className="usuarios-btn usuarios-btn-primary"
                onClick={openCreateModal}
              >
                ➕ Crear primer usuario
              </button>
            )}
          </div>
        ) : (
          <div className="usuarios-grid">
            {filtered.map((user) => {
              const roleBadge = getRoleBadgeColor(user.role);
              const initials = (user.nombre_usuario || user.username || "?")
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              return (
                <div key={user.id} className="usuario-card">
                  <div className="usuario-card-header">
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <div className="usuario-avatar">{initials}</div>
                      <div className="usuario-info">
                        <h3 className="usuario-name">
                          {user.nombre_usuario || user.username || "Sin nombre"}
                        </h3>
                        <p className="usuario-username">@{user.username}</p>
                      </div>
                    </div>
                    <span
                      className="usuario-badge"
                      style={{
                        background: roleBadge.bg,
                        color: roleBadge.color,
                        border: `1px solid ${roleBadge.border}`,
                      }}
                    >
                      {user.role === "admin" ? "👑 Admin" : "💼 Cajero"}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#64748b",
                      marginTop: "8px",
                    }}
                  >
                    <div>ID: {user.id}</div>
                  </div>

                  <div className="usuario-card-footer">
                    <button
                      className="usuario-card-btn usuario-card-btn-edit"
                      onClick={() => openEditModal(user)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      className="usuario-card-btn usuario-card-btn-delete"
                      onClick={() =>
                        openDeleteConfirm(user.id, user.username, user.role)
                      }
                      disabled={user.role !== "cajero"}
                      title={
                        user.role !== "cajero"
                          ? "Solo se pueden eliminar cajeros"
                          : ""
                      }
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <UsuarioModal
        open={modalOpen}
        onClose={closeModal}
        onSave={handleSaveUser}
        editUser={editUser}
      />

      {confirmDeleteOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "480px",
              boxShadow: "0 20px 60px rgba(2, 6, 23, 0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingBottom: "12px",
                borderBottom: "2px solid #e2e8f0",
              }}
            >
              <h3
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#1e293b",
                  margin: 0,
                }}
              >
                ⚠️ Confirmar eliminación
              </h3>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "4px 8px",
                  lineHeight: 1,
                }}
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setAdminPassword("");
                  setPasswordError(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>

            <p style={{ color: "#334155", marginBottom: "20px" }}>
              ¿Estás seguro de eliminar al usuario{" "}
              <strong>"{confirmDeleteName}"</strong>? Esta acción no se puede
              deshacer.
            </p>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                Contraseña de administrador *
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder="Ingresa tu contraseña"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: passwordError
                    ? "1px solid #ef4444"
                    : "1px solid #cbd5e1",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  boxSizing: "border-box",
                }}
                disabled={verifyingPassword || loading}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !verifyingPassword && !loading) {
                    performDeleteUser();
                  }
                }}
              />
              {passwordError && (
                <div
                  style={{
                    color: "#ef4444",
                    fontSize: "0.875rem",
                    marginTop: "6px",
                  }}
                >
                  {passwordError}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
                paddingTop: "16px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <button
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  color: "#334155",
                }}
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setAdminPassword("");
                  setPasswordError(null);
                }}
                disabled={verifyingPassword || loading}
                type="button"
              >
                Cancelar
              </button>
              <button
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor:
                    verifyingPassword || loading ? "not-allowed" : "pointer",
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  opacity: verifyingPassword || loading ? 0.6 : 1,
                }}
                onClick={performDeleteUser}
                disabled={verifyingPassword || loading}
                type="button"
              >
                {verifyingPassword || loading
                  ? "Verificando..."
                  : "Eliminar usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Confirmado
        open={successOpen}
        title="✅ Usuario eliminado"
        message="El usuario fue eliminado correctamente del sistema."
        onClose={() => setSuccessOpen(false)}
      />

      <Confirmado
        open={errorOpen}
        title="❌ Error"
        message={errorMessage}
        onClose={() => setErrorOpen(false)}
      />
    </>
  );
}
