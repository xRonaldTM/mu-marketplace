import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://yrnmygxllrxrspjmvvvm.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlybm15Z3hsbHJ4cnNwam12dnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzAxMjIsImV4cCI6MjA3MjYwNjEyMn0.zdgRKQf4xAEOc9ZZgKODtSN8Moo58gtc3Tj4sBRuLCA";
const supabase = createClient(supabaseUrl, supabaseKey);

const CATEGORIES = ["alas", "armas", "armaduras", "joyeria", "joyas", "otros"];

export default function App() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newContacto, setNewContacto] = useState("");
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newImage, setNewImage] = useState(null);
  const [activeTab, setActiveTab] = useState("ventas");

  // Buscador
  const [searchName, setSearchName] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const [searchCategory, setSearchCategory] = useState("");

  // Scroll infinito
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;
  const observer = useRef();

  // ---------------- LOGIN ----------------
  async function register() {
    const { data: existing } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();
    if (existing) return alert("Ese usuario ya existe");

    const { data, error } = await supabase
      .from("users")
      .insert([{ username, password }])
      .select()
      .single();
    if (error) alert("Error registrando: " + error.message);
    else setUser(data);
  }

  async function login() {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .eq("password", password)
      .single();
    if (error || !data) return alert("Usuario o contraseña incorrectos");
    setUser(data);
  }

  function logout() {
    setUser(null);
  }

  // ---------------- ITEMS ----------------
  useEffect(() => {
    fetchItems();
    const sub = supabase
      .channel("items-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        () => fetchItems()
      )
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("price", { ascending: true });
    if (!error) setItems(data || []);
    setLoading(false);
  }

  async function uploadImage(file) {
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("item-images")
      .upload(fileName, file, { contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData, error: urlError } = supabase.storage
      .from("item-images")
      .getPublicUrl(fileName);
    if (urlError) throw new Error(urlError.message);

    return urlData.publicUrl;
  }

  async function createItem(e) {
    e.preventDefault();
    if (!user) return alert("Debes iniciar sesión");
    if (!newName || !newPrice || !newContacto || !newImage)
      return alert("Debes llenar todos los campos antes de publicar");

    try {
      let imageUrl = await uploadImage(newImage);

      const { error } = await supabase.from("items").insert([
        {
          name: newName,
          price: Number(newPrice),
          category: newCategory,
          contacto: newContacto,
          image_url: imageUrl,
          user_id: user.id,
          username: user.username,
        },
      ]);
      if (error) throw new Error(error.message);

      setNewName("");
      setNewPrice("");
      setNewContacto("");
      setNewCategory(CATEGORIES[0]);
      setNewImage(null);
      fetchItems();
    } catch (err) {
      alert("Error publicando: " + err.message);
    }
  }

  async function markAsSold(itemId) {
    if (!user) return alert("Debes iniciar sesión");
    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id);
    if (error) return alert("Error eliminando item: " + error.message);
    fetchItems();
  }

  // ---------------- FILTRADO ----------------
  const filteredItems = items.filter(it => {
    return (
      (!searchName || it.name.toLowerCase().includes(searchName.toLowerCase())) &&
      (!searchUser || it.username.toLowerCase().includes(searchUser.toLowerCase())) &&
      (!searchCategory || it.category === searchCategory)
    );
  }).sort((a, b) => a.price - b.price);

  const renderItems = (filter) => {
    const filtered = filter === "misItems"
      ? filteredItems.filter(it => it.user_id === user.id).sort((a, b) => a.price - b.price)
      : filteredItems;

    if (filtered.length === 0)
      return (
        <div className="text-center py-5">
          <div className="card">
            <div className="card-body">
              <h5 className="card-title text-muted">No hay items disponibles</h5>
              <p className="card-text text-muted">
                {filter === "misItems" 
                  ? "No has publicado ningún item aún." 
                  : "No se encontraron items con los filtros aplicados."}
              </p>
            </div>
          </div>
        </div>
      );

    return (
      <div className="row g-1 w-100">
        {filtered.slice(0, page * itemsPerPage).map(it => (
          <div key={it.id} className="col-xxl-2 col-xl-2 col-lg-3 col-md-4 col-sm-6 col-12">
            <div className="card h-100" style={{ 
              background: 'linear-gradient(135deg, #4b5563 0%, #6b7280 100%)', 
              border: '1px solid #6b7280',
              boxShadow: '0 4px 15px rgba(107, 114, 128, 0.1)'
            }}>
              <div className="position-relative" style={{ height: '180px', overflow: 'hidden' }}>
                <img
                  src={it.image_url || "https://via.placeholder.com/300x200"}
                  alt={it.name}
                  className="card-img-top"
                  style={{ 
                    height: '100%', 
                    width: '100%',
                    objectFit: 'contain',
                    backgroundColor: '#374151',
                    cursor: 'pointer',
                    transition: 'transform 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'scale(1)';
                  }}
                />
                <span className="badge position-absolute top-0 end-0 m-1" style={{ 
                  background: '#6b7280', 
                  color: 'white',
                  fontWeight: 'bold'
                }}>
                  {it.category}
                </span>
              </div>
              <div className="card-body d-flex flex-column p-2">
                <h6 className="card-title mb-1" style={{ 
                  color: '#d1d5db', 
                  fontSize: '0.9rem',
                  fontWeight: 'bold'
                }}>
                  {it.name}
                </h6>
                <p className="card-text mb-1">
                  <strong style={{ color: '#fbbf24', fontSize: '0.85rem' }}>💰 {it.price} WCC</strong>
                </p>
                <p className="card-text mb-1" style={{ fontSize: '0.75rem', color: '#fbbf24' }}>
                  <span style={{ color: '#fbbf24' }}>📞</span> {it.contacto || 'Sin contacto'}
                </p>
                <p className="card-text mb-2" style={{ fontSize: '0.75rem', color: '#d1d5db' }}>
                  <span style={{ color: '#d1d5db' }}>👤</span> {it.username}
                </p>
                {filter === "misItems" && (
                  <div className="mt-auto">
                    <button
                      onClick={() => markAsSold(it.id)}
                      className="btn w-100 fw-bold"
                      style={{ 
                        background: '#dc2626', 
                        border: 'none', 
                        color: 'white',
                        fontSize: '0.8rem',
                        padding: '0.25rem'
                      }}
                    >
                      ⚔️ Vendido
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length > page * itemsPerPage && (
          <div ref={observer} className="col-12">
            <div className="text-center py-3">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Cargando más items...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ---------------- SCROLL INFINITO ----------------
  useEffect(() => {
    const handleObserver = (entries) => {
      const target = entries[0];
      if (target.isIntersecting) setPage(prev => prev + 1);
    };
    const option = { root: null, rootMargin: "20px", threshold: 1.0 };
    const observerEl = new IntersectionObserver(handleObserver, option);
    if (observer.current) observerEl.observe(observer.current);
    return () => observerEl.disconnect();
  }, [observer]);

  // ---------------- RENDER ----------------
  return (
    <div className="min-vh-100 w-100" style={{ 
      background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 50%, #3a3a5c 100%)',
      backgroundAttachment: 'fixed',
      minHeight: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0
    }}>
      {/* HEADER */}
      <nav className="navbar navbar-expand-lg" style={{ background: 'linear-gradient(90deg, #374151 0%, #4b5563 100%)', borderBottom: '2px solid #6b7280' }}>
        <div className="container-fluid px-3">
          <a className="navbar-brand fw-bold fs-3" href="#" style={{ 
            color: '#d1d5db',
            textShadow: '0 0 3px rgba(209, 213, 219, 0.2)'
          }}>
            ⚔️ MU WCC MARKETPLACE ⚔️
          </a>
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarNav"
              style={{ borderColor: '#6b7280' }}
            >
              <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse" id="navbarNav">
              {user ? (
                <div className="navbar-nav ms-auto d-flex align-items-center">
                  <span className="navbar-text me-3 fw-bold" style={{ color: '#d1d5db' }}>👤 {user.username}</span>
                  <button
                    onClick={logout}
                    className="btn btn-outline-danger"
                    style={{ borderColor: '#dc2626', color: '#dc2626' }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              ) : (
                <div className="navbar-nav ms-auto">
                  <div className="d-flex flex-column flex-md-row gap-2">
                    <input
                      className="form-control"
                      placeholder="Usuario"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      style={{ background: '#4b5563', border: '1px solid #6b7280', color: 'white' }}
                    />
                    <input
                      className="form-control"
                      type="password"
                      placeholder="Contraseña"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ background: '#4b5563', border: '1px solid #6b7280', color: 'white' }}
                    />
                    <div className="d-flex gap-2">
                      <button
                        onClick={login}
                        className="btn"
                        style={{ background: '#6b7280', border: 'none', color: 'white', fontWeight: 'bold' }}
                      >
                        Entrar
                      </button>
                      <button
                        onClick={register}
                        className="btn"
                        style={{ background: '#059669', border: 'none', color: 'white', fontWeight: 'bold' }}
                      >
                        Registrarme
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      </nav>

      {user ? (
        <div className="w-100 py-3" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
          {/* TABS */}
          <ul className="nav nav-tabs mb-3" role="tablist" style={{ borderBottom: '2px solid #6b7280' }}>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link fw-bold ${activeTab === "ventas" ? "active" : ""}`}
                onClick={() => setActiveTab("ventas")}
                type="button"
                role="tab"
                style={{ 
                  background: activeTab === "ventas" ? '#6b7280' : 'transparent',
                  color: activeTab === "ventas" ? 'white' : '#d1d5db',
                  border: 'none',
                  borderRadius: '8px 8px 0 0'
                }}
              >
                🛒 Ventas
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link fw-bold ${activeTab === "misItems" ? "active" : ""}`}
                onClick={() => setActiveTab("misItems")}
                type="button"
                role="tab"
                style={{ 
                  background: activeTab === "misItems" ? '#6b7280' : 'transparent',
                  color: activeTab === "misItems" ? 'white' : '#d1d5db',
                  border: 'none',
                  borderRadius: '8px 8px 0 0'
                }}
              >
                ⚔️ Mis Items
              </button>
            </li>
          </ul>

          {/* FILTROS VENTAS */}
          {activeTab === "ventas" && (
            <div className="row mb-3 g-2">
              <div className="col-md-4">
                <input
                  placeholder="🔍 Buscar por nombre"
                  className="form-control"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  style={{ background: '#4b5563', border: '1px solid #6b7280', color: 'white' }}
                />
              </div>
              <div className="col-md-4">
                <input
                  placeholder="👤 Buscar por usuario"
                  className="form-control"
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  style={{ background: '#4b5563', border: '1px solid #6b7280', color: 'white' }}
                />
              </div>
              <div className="col-md-4">
                <select
                  className="form-select"
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  style={{ background: '#4b5563', border: '1px solid #6b7280', color: 'white' }}
                >
                  <option value="">🏷️ Todas las categorías</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* CONTENIDO */}
          <main className="w-100">
            {activeTab === "misItems" && (
              <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #4b5563 0%, #6b7280 100%)', border: '1px solid #6b7280' }}>
                <div className="card-header" style={{ background: '#6b7280', color: 'white' }}>
                  <h5 className="card-title mb-0 fw-bold">⚔️ Publicar Nuevo Item</h5>
                </div>
                <div className="card-body">
                  <form onSubmit={createItem}>
                    <div className="row g-2">
                      <div className="col-md-3">
                        <input
                          className="form-control"
                          placeholder="🏷️ Nombre del Item"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          required
                          style={{ background: '#374151', border: '1px solid #6b7280', color: 'white' }}
                        />
                      </div>
                      <div className="col-md-2">
                        <input
                          className="form-control"
                          placeholder="💰 Precio WCC"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value)}
                          required
                          style={{ background: '#374151', border: '1px solid #6b7280', color: 'white' }}
                        />
                      </div>
                      <div className="col-md-3">
                        <input
                          className="form-control"
                          placeholder="📞 Discord / Contacto"
                          value={newContacto}
                          onChange={(e) => setNewContacto(e.target.value)}
                          required
                          style={{ background: '#374151', border: '1px solid #6b7280', color: 'white' }}
                        />
                      </div>
                      <div className="col-md-2">
                        <select
                          className="form-select"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          style={{ background: '#374151', border: '1px solid #6b7280', color: 'white' }}
                        >
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="col-md-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setNewImage(e.target.files[0])}
                          className="form-control"
                          required
                          style={{ background: '#374151', border: '1px solid #6b7280', color: 'white' }}
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <button 
                        className="btn fw-bold" 
                        type="submit"
                        style={{ background: '#059669', border: 'none', color: 'white' }}
                      >
                        ⚔️ Publicar Item
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
                <p className="mt-2 text-muted">Cargando items...</p>
              </div>
            ) : (
              renderItems(activeTab)
            )}
          </main>
        </div>
      ) : (
        <div className="container-fluid py-5">
          <div className="row justify-content-center">
            <div className="col-md-6 text-center">
              <div className="card">
                <div className="card-body">
                  <h2 className="card-title">🔑 Bienvenido al Marketplace</h2>
                  <p className="card-text text-muted">
                    Inicia sesión o regístrate para ver y publicar ítems.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
