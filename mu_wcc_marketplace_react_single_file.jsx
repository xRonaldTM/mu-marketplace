import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// ---------- CONFIG ----------
// Set these in your environment (e.g. Vercel env vars) before running
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://your-supabase-url.supabase.co'
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'public-anon-key'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Categories fixed list
const CATEGORIES = ['alas', 'armas', 'armaduras', 'joyeria', 'joyas', 'otros']

// ---------- Component ----------
export default function MuMarketplaceApp() {
  // Auth
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Items
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [sort, setSort] = useState('recent') // recent | cheap | expensive

  // New item form
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState(CATEGORIES[0])
  const [newImage, setNewImage] = useState(null)
  const [posting, setPosting] = useState(false)

  // Messaging / chat
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messageText, setMessageText] = useState('')

  // ---------- Auth handlers ----------
  useEffect(() => {
    const session = supabase.auth.getSession().then(r => r.data?.session)
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })
    // initial set
    (async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data?.user || null)
    })()
  }, [])

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return alert('Error signUp: ' + error.message)
    alert('Revisa tu correo para confirmar la cuenta (si tu Supabase tiene email enabled).')
  }
  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return alert('Error signIn: ' + error.message)
  }
  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  // ---------- Items: fetch, create, realtime ----------
  useEffect(() => {
    fetchItems()

    // realtime subscription to items table
    const subscription = supabase
      .channel('public:items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, payload => {
        // simple strategy: refetch on change
        fetchItems()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategory, priceMin, priceMax, sort])

  async function fetchItems() {
    setLoading(true)
    let query = supabase.from('items').select('id,name,price,category,image_url,user_id,created_at,username').order('created_at', { ascending: false })

    // filters
    if (filterCategory) query = query.eq('category', filterCategory)
    if (priceMin) query = query.gte('price', Number(priceMin))
    if (priceMax) query = query.lte('price', Number(priceMax))

    // sorting
    if (sort === 'cheap') query = query.order('price', { ascending: true })
    if (sort === 'expensive') query = query.order('price', { ascending: false })

    const { data, error } = await query.limit(200)
    if (error) console.error('fetchItems error', error)
    else setItems(data || [])
    setLoading(false)
  }

  async function handleImageUpload(file) {
    const fileName = `${Date.now()}_${file.name}`
    const { data, error } = await supabase.storage.from('item-images').upload(fileName, file)
    if (error) {
      console.error('upload error', error)
      throw error
    }
    const publicUrl = supabase.storage.from('item-images').getPublicUrl(fileName).data.publicUrl
    return publicUrl
  }

  async function createItem(e) {
    e.preventDefault()
    if (!user) return alert('Inicia sesión para publicar')
    setPosting(true)
    try {
      let imageUrl = null
      if (newImage) {
        imageUrl = await handleImageUpload(newImage)
      }
      const username = user.user_metadata?.full_name || user.email || 'vendedor'
      const { error } = await supabase.from('items').insert([{ name: newName, price: Number(newPrice), category: newCategory, image_url: imageUrl, user_id: user.id, username }])
      if (error) throw error
      // reset form
      setNewName('')
      setNewPrice('')
      setNewCategory(CATEGORIES[0])
      setNewImage(null)
      // items will update via realtime
    } catch (err) {
      console.error(err)
      alert('Error publicando: ' + (err.message || err))
    }
    setPosting(false)
  }

  // ---------- Messaging (simple conversations) ----------
  useEffect(() => {
    // load conversations for current user
    if (!user) return
    (async () => {
      const { data } = await supabase.from('conversations').select('*').or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      setConversations(data || [])
    })()

    const sub = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        // if active conversation matches, append message
        if (activeConv && payload.new.conversation_id === activeConv.id) {
          setActiveConv(prev => ({ ...prev, messages: [...(prev.messages||[]), payload.new] }))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(sub)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeConv])

  async function openConversation(conv) {
    setActiveConv(null)
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    setActiveConv({ ...conv, messages: data || [] })
  }

  async function sendMessage() {
    if (!activeConv || !user) return
    await supabase.from('messages').insert([{ conversation_id: activeConv.id, sender_id: user.id, text: messageText }])
    setMessageText('')
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">MuWCC Marketplace</h1>
          <div>
            {user ? (
              <div className="flex gap-2 items-center">
                <span className="text-sm">{user.email}</span>
                <button className="px-3 py-1 rounded bg-red-500 text-white" onClick={signOut}>Cerrar sesión</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input className="border px-2 py-1" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
                <input className="border px-2 py-1" placeholder="contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={signIn}>Entrar</button>
                <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={signUp}>Registrarme</button>
              </div>
            )}
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Post item + filters */}
          <aside className="col-span-1 bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Publicar ítem</h2>
            <form onSubmit={createItem} className="space-y-2">
              <input className="w-full border px-2 py-1" placeholder="Nombre del ítem" value={newName} onChange={e => setNewName(e.target.value)} required />
              <input className="w-full border px-2 py-1" placeholder="Precio (WCC)" value={newPrice} onChange={e => setNewPrice(e.target.value)} required />
              <select className="w-full border px-2 py-1" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input type="file" accept="image/*" onChange={e => setNewImage(e.target.files[0])} />
              <button className="w-full px-3 py-2 bg-indigo-600 text-white rounded" disabled={posting}>{posting ? 'Publicando...' : 'Publicar'}</button>
            </form>

            <hr className="my-4" />
            <h3 className="font-semibold">Filtro rápido</h3>
            <div className="space-y-2 mt-2">
              <select className="w-full border px-2 py-1" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <div className="flex gap-2">
                <input className="w-1/2 border px-2 py-1" placeholder="Min WCC" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
                <input className="w-1/2 border px-2 py-1" placeholder="Max WCC" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
              </div>
              <select className="w-full border px-2 py-1" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="recent">Más recientes</option>
                <option value="cheap">Más baratos</option>
                <option value="expensive">Más caros</option>
              </select>
              <button className="w-full px-3 py-2 bg-gray-800 text-white rounded" onClick={fetchItems}>Aplicar filtros</button>
            </div>
          </aside>

          {/* Center: Items list */}
          <section className="col-span-2">
            <div className="bg-white p-4 rounded shadow mb-4">
              <h2 className="font-semibold">Ítems publicados recientemente</h2>
              {loading ? <p>Cargando...</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {items.map(it => (
                    <div key={it.id} className="flex bg-gray-50 rounded p-3 items-center gap-3">
                      <img src={it.image_url || 'https://via.placeholder.com/80'} alt={it.name} className="w-20 h-20 object-cover rounded" />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold">{it.name}</div>
                            <div className="text-sm text-gray-600">{it.category} • {it.username || it.user_id}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold">{it.price} WCC</div>
                            <div className="text-xs text-gray-500">{new Date(it.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button className="px-2 py-1 border rounded">Ver</button>
                          <button className="px-2 py-1 border rounded" onClick={() => startConversationWith(it.user_id)}>Mensajear</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Messaging panel */}
            <div className="bg-white p-4 rounded shadow">
              <h3 className="font-semibold">Mensajería</h3>
              {!user ? <p className="text-sm text-gray-600">Inicia sesión para usar mensajes</p> : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                  <div className="col-span-1">
                    <h4 className="font-medium">Conversaciones</h4>
                    <div className="mt-2 space-y-2">
                      {conversations.map(c => (
                        <button key={c.id} className={`w-full text-left p-2 border rounded ${activeConv?.id === c.id ? 'bg-blue-100' : ''}`} onClick={() => openConversation(c)}>
                          {c.title || `Con ${c.user_a === user.id ? c.user_b : c.user_a}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-2">
                    {activeConv ? (
                      <div>
                        <div className="h-48 overflow-auto border rounded p-2 bg-gray-50">
                          {activeConv.messages?.map(m => (
                            <div key={m.id} className={`mb-2 ${m.sender_id === user.id ? 'text-right' : 'text-left'}`}>
                              <div className="inline-block p-2 rounded" style={{ background: m.sender_id === user.id ? '#dbeafe' : '#e2e8f0' }}>{m.text}</div>
                              <div className="text-xs text-gray-500">{new Date(m.created_at).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <input className="flex-1 border px-2 py-1" value={messageText} onChange={e => setMessageText(e.target.value)} />
                          <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={sendMessage}>Enviar</button>
                        </div>
                      </div>
                    ) : <p className="text-sm text-gray-600">Abre una conversación para ver mensajes</p>}
                  </div>
                </div>
              )}
            </div>

          </section>
        </main>

      </div>
    </div>
  )

  // ---------- helper: start conversation ----------
  async function startConversationWith(otherUserId) {
    if (!user) return alert('Inicia sesión para mensajear')
    if (otherUserId === user.id) return alert('No puedes mensajear contigo mismo')

    // check if conversation exists
    const { data } = await supabase.from('conversations').select('*').or(`(user_a.eq.${user.id},user_b.eq.${otherUserId}),(user_a.eq.${otherUserId},user_b.eq.${user.id})`)
    let conv = data?.[0]
    if (!conv) {
      const title = `Chat ${user.email} ↔ ${otherUserId}`
      const res = await supabase.from('conversations').insert([{ user_a: user.id, user_b: otherUserId, title }]).select().maybeSingle()
      conv = res.data
      // reload conversations list
      const { data: convs } = await supabase.from('conversations').select('*').or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      setConversations(convs || [])
    }
    openConversation(conv)
  }
}

/*
  NOTAS IMPORTANTES (leer antes de ejecutar):
  - Crea un proyecto en Supabase.
  - En Supabase SQL crea las tablas: users (opcional), items, conversations, messages.
  - Crea un bucket público llamado "item-images" en Storage.
  - Asegúrate de aplicar RLS (políticas) si quieres que solo usuarios escriban su contenido.

  Ejemplo rápido de tablas (SQL):

  -- items table
  create table items (
    id uuid default gen_random_uuid() primary key,
    name text,
    price integer,
    category text,
    image_url text,
    user_id uuid,
    username text,
    created_at timestamptz default now()
  );

  -- conversations
  create table conversations (
    id uuid default gen_random_uuid() primary key,
    user_a uuid,
    user_b uuid,
    title text,
    created_at timestamptz default now()
  );

  -- messages
  create table messages (
    id uuid default gen_random_uuid() primary key,
    conversation_id uuid references conversations(id) on delete cascade,
    sender_id uuid,
    text text,
    created_at timestamptz default now()
  );

  - Instala dependencias en tu proyecto React: supabase-js, tailwind (opcional), react.
  - Variables de entorno: REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY
  - Para que suba imágenes correctamente, asegúrate de habilitar CORS y las reglas de Storage.

  ¿Quieres que te genere el SQL y un README listo para usar con comandos paso a paso para desplegar en Vercel? 
*/
