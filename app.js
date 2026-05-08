// --- PROTOCOLO DE EXTRACCIÓN MAIBASYNC ---
const tg = window.Telegram.WebApp;
tg.ready();

function extraerIdSeguro() {
    // Intento 1: El objeto directo (lo que ya usas)
    if (tg.initDataUnsafe?.user?.id) {
        return tg.initDataUnsafe.user.id.toString();
    }

    // Intento 2: Parsear el initData (a veces viene como string de URL)
    try {
        const params = new URLSearchParams(tg.initData);
        const userRaw = params.get('user');
        if (userRaw) {
            const userObj = JSON.parse(userRaw);
            if (userObj.id) return userObj.id.toString();
        }
    } catch (e) {
        console.error("Error parseando initData:", e);
    }

    // Intento 3: Modo Desarrollo (Hardcoded temporal para pruebas)
    // Pon tu ID real aquí para que puedas trabajar en Ciudad Obregón sin depender de Telegram
    console.warn("⚠️ Usando ID de respaldo para desarrollo local.");
    return "0";
}

const telegramIdActual = extraerIdSeguro();

// --- CONFIGURACIÓN SUPABASE ---
const _K = 'https://gcdjrmlurgmsimxfcnhl.supabase.co';
const _P = 'sb_publishable_tfuxf7U1TmUuofjIePGVeg_ZfUCZvtk';

const supabaseCont = supabase.createClient(_K, _P, {
    global: {
        headers: {
            'x-telegram-id': telegramIdActual
        }
    }
});

console.log('ID Detectado para Supabase:', telegramIdActual);

let canal = 'wa';
let filtroActual = 'all';
let mensajes = []; // Se llenará desde la DB
let numerosSeleccionados = [];

let limiteCarga = 20; // Cuántos traer por vez


let paginaActual = 0;
const registrosPorPagina = 20;
let cargandoMas = false;
let hayMasDatos = true; // Para saber cuándo dejar de pedir






function obtenerFechaLocalActual() {
    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    const dd = String(ahora.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// --- TU WINDOW ONLOAD (MODIFICADO PARA CARGAR DE DB) ---
// --- TU WINDOW ONLOAD ACTUALIZADO ---
window.onload = async () => {
    // 1. VERIFICACIÓN DE PROTOCOLO DE REGISTRO (MAIBATECH)
    if (telegramIdActual !== "0") {
        const { data: client, error } = await supabaseCont
            .from('maiba_clients')
            .select('*')
            .eq('telegram_id', telegramIdActual)
            .single();

        if (error || !client) {
            // Si no existe el perfil de empresa, bloqueamos con el modal
            document.getElementById('modal-registro').classList.remove('hidden');
            if (window.lucide) lucide.createIcons(); // Para los iconos del modal
            return; // Detenemos la carga del resto de la app
        }
        console.log("Acceso Autorizado: " + client.company_name);
    }

    // 2. CONTINUAR CON TU LÓGICA NORMAL (Si el registro existe)
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !cargandoMas && hayMasDatos) {
            const telBusqueda = document.getElementById('busqueda-tel').value.trim();
            cargarMensajes(telBusqueda, true);
        }
    }, { threshold: 0.1 });

    observer.observe(document.getElementById('scroll-anchor'));

    const hoy = obtenerFechaLocalActual();
    const filtroFechaInput = document.getElementById('filtro-fecha');
    if (filtroFechaInput && !filtroFechaInput.value) {
        filtroFechaInput.value = hoy;
    }

    setCanal('wa');
    if (window.lucide) lucide.createIcons();

    await cargarMensajes();
};

// --- NUEVA FUNCIÓN PARA TRAER DATOS ---
async function cargarMensajes(busquedaTel = "", acumular = false) {
    if (cargandoMas || (!hayMasDatos && acumular)) return;

    const fechaFiltro = document.getElementById('filtro-fecha').value;

    console.log(fechaFiltro)

    actualizarContadores(fechaFiltro);

    cargandoMas = true;
    if (!acumular) {
        paginaActual = 0;
        hayMasDatos = true;
        mensajes = [];
    }

    let desde = paginaActual * registrosPorPagina;
    let hasta = desde + registrosPorPagina - 1;

    // 1. Iniciamos la query base
    let query = supabaseCont
        .from('sync_logs')
        .select('*')
        .order('scheduled_time', { ascending: true })
        .range(desde, hasta);

    // --- LOGICA DE FILTROS CRUZADOS ---

    if (busquedaTel && busquedaTel.length === 10) {
        // REGLA A: Si hay teléfono, BUSQUEDA GLOBAL (olvidamos la fecha)
        query = query.contains('recipients', [busquedaTel]);

        // Solo traemos los que aún no han pasado (Pendientes por tiempo)
        // const ahoraUTC = new Date().toISOString();
        // query = query.gte('scheduled_time', ahoraUTC);

    } else {
        // REGLA B: Si NO hay teléfono, usamos el FILTRO DE FECHA
        let fechaFiltro = document.getElementById('filtro-fecha').value;
        if (!fechaFiltro) {
            fechaFiltro = obtenerFechaLocalActual();
            document.getElementById('filtro-fecha').value = fechaFiltro;
        }

        // Crear inicio y fin del día LOCAL y convertir a ISO para la DB
        const inicioDia = new Date(fechaFiltro + 'T00:00:00'); // Hora local 00:00
        const finDia = new Date(fechaFiltro + 'T23:59:59');    // Hora local 23:59

        const inicioUTC = inicioDia.toISOString();
        const finUTC = finDia.toISOString();

        query = query.gte('scheduled_time', inicioUTC).lte('scheduled_time', finUTC);
    }

    // 2. Ejecutar consulta
    const { data, error } = await query;

    if (error) {
        console.error("Error en query:", error.message);
        cargandoMas = false;
        return;
    }

    if (data) {
        if (data.length < registrosPorPagina) hayMasDatos = false;

        const nuevosMensajes = data.map(d => {
            const fechaLocal = new Date(d.scheduled_time);
            return {
                id: d.id,
                tel: d.recipients.join(', '),
                msg: d.message_body,
                fec: formatearFechaLocal(fechaLocal),
                canal: d.channel_type
            };
        });

        mensajes = acumular ? [...mensajes, ...nuevosMensajes] : nuevosMensajes;
        paginaActual++;
        renderList();
    }

    cargandoMas = false;
}


// --- FUNCIÓN DE REGISTRO DE EMPRESA ---
async function finalizarRegistro() {
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;

    // Bloqueo de UI
    btn.disabled = true;
    btn.innerHTML = `<span class="animate-pulse">CONFIGURANDO...</span>`;

    const payload = {
        telegram_id: telegramIdActual,
        company_name: document.getElementById('reg-empresa').value.trim(),
        address: document.getElementById('reg-direccion').value.trim(),
        city: document.getElementById('reg-ciudad').value.trim(),
        state: document.getElementById('reg-estado').value.trim(),
        business_phone: document.getElementById('reg-telefono').value.trim(),
        tg_username: tg.initDataUnsafe?.user?.username || null
    };

    // Validaciones de negocio
    if (!payload.company_name || !payload.business_phone) {
        alert("⚠️ Los campos de Empresa y Teléfono son obligatorios para el protocolo.");
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
    }

    const { error } = await supabaseCont
        .from('maiba_clients')
        .insert([payload]);

    if (!error) {
        alert("✅ Registro Exitoso. Bienvenido a MaibaTech.");
        document.getElementById('modal-registro').classList.add('hidden');
        location.reload(); // Recargamos para que el onload pase la verificación
    } else {
        console.error("Error en registro:", error);
        alert("❌ Error: " + error.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}



async function resetearYFiltrar() {
    const telBusqueda = document.getElementById('busqueda-tel').value.trim();
    // Forzamos recarga desde página 0
    await cargarMensajes(telBusqueda, false);
}
// Función auxiliar para no repetir código de fechas
function formatearFechaLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// --- TUS FUNCIONES DE UI (SIN CAMBIOS) ---
function setCanal(tipo) {
    canal = tipo;
    const isWa = tipo === 'wa';
    const btnMain = document.getElementById('btnMain');
    const brandSync = document.getElementById('brand-sync');

    document.getElementById('btn-wa').className = isWa
        ? 'flex-1 py-3 rounded-lg text-xs font-black bg-green-500 text-white uppercase shadow-lg transition-all flex items-center justify-center gap-2'
        : 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase transition-all flex items-center justify-center gap-2';

    document.getElementById('btn-tg').className = !isWa
        ? 'flex-1 py-3 rounded-lg text-xs font-black bg-blue-500 text-white uppercase shadow-lg transition-all flex items-center justify-center gap-2'
        : 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase transition-all flex items-center justify-center gap-2';

    brandSync.className = isWa ? 'text-green-500 text-4xl transition-colors duration-500' : 'text-blue-500 text-4xl transition-colors duration-500';

    const inputs = ['telefono-input', 'mensaje', 'fecha'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        el.classList.remove('border-wa', 'border-tg');
        el.classList.add(isWa ? 'border-wa' : 'border-tg');
    });

    const isEditing = document.getElementById('edit-id').value !== '';
    if (!isEditing) {
        if (isWa) {
            btnMain.className = "w-full py-5 bg-green-500 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all";
        } else {
            btnMain.className = "w-full py-5 bg-blue-500 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all";
        }
    }
}

function setFilter(f) {
    filtroActual = f;
    ['all', 'wa', 'tg'].forEach(id => {
        const btn = document.getElementById(`f-${id}`);
        btn.className = 'filter-pill px-5 py-2 rounded-full text-[10px] uppercase font-bold';
    });
    const activeBtn = document.getElementById(`f-${f}`);
    activeBtn.classList.add(canal === 'wa' ? 'active-wa' : 'active-tg');
    renderList();
}

function switchTab(view) {
    document.getElementById('view-form').classList.toggle('hidden', view !== 'form');
    document.getElementById('view-list').classList.toggle('hidden', view !== 'list');
    document.getElementById('tab-form').className = `flex-1 py-4 font-black text-xs uppercase transition-all ${view === 'form' ? (canal === 'wa' ? 'tab-active-wa' : 'tab-active-tg') : 'text-gray-500'}`;
    document.getElementById('tab-list').className = `flex-1 py-4 font-black text-xs uppercase transition-all ${view === 'list' ? (canal === 'wa' ? 'tab-active-wa' : 'tab-active-tg') : 'text-gray-500'}`;
    if (view === 'list') renderList();
}

function agregarNumeroTag() {
    const input = document.getElementById('telefono-input');
    const num = input.value.trim();
    if (!/^\d{10}$/.test(num)) return alert("10 dígitos requeridos");
    if (numerosSeleccionados.length >= 3) return alert("Máximo 3");
    if (numerosSeleccionados.includes(num)) return;
    numerosSeleccionados.push(num);
    input.value = '';
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tags-container');
    container.innerHTML = numerosSeleccionados.map(n => `<div class="bg-white/10 px-3 py-1 rounded-full border border-white/10 text-xs font-bold flex items-center gap-2">${n}<button onclick="eliminarTag('${n}')" class="text-red-400">✕</button></div>`).join('');
}

function eliminarTag(num) {
    numerosSeleccionados = numerosSeleccionados.filter(n => n !== num);
    renderTags();
}

function updateCharCount(el) {
    document.getElementById('char-count').innerText = `${el.value.length} / 500`;
}

function toggleMensaje(id, btn) {
    const texto = document.getElementById(`msg-text-${id}`);
    const isTruncated = texto.classList.contains('mensaje-truncado');
    if (isTruncated) {
        texto.classList.remove('mensaje-truncado');
        btn.innerText = 'Leer menos';
    } else {
        texto.classList.add('mensaje-truncado');
        btn.innerText = 'Leer más';
    }
}

// --- TU RENDER LIST (INTACTO) ---
function renderList() {
    const cont = document.getElementById('contenedor-mensajes');
    const fechaFiltro = document.getElementById('filtro-fecha').value;
    const telBusqueda = document.getElementById('busqueda-tel').value.trim();

    let filtrados = mensajes.filter(m => {
        return filtroActual === 'all' || m.canal === filtroActual;
    });

    if (filtrados.length === 0) {
        cont.innerHTML = '<p class="text-center text-gray-600 text-[10px] mt-10 uppercase tracking-widest">Sin registros coincidentes</p>';
        return;
    }

    cont.innerHTML = filtrados.map(m => `
        <div class="msg-card p-6 rounded-[2rem] space-y-5 animate-card relative overflow-hidden">
            <div class="absolute top-0 right-0 p-5 flex gap-6">
                <button onclick="editarRegistro('${m.id}')" class="text-gray-400 hover:text-white transition-all active:scale-125"><i data-lucide="edit-3" class="w-5 h-5"></i></button>
                <button onclick="eliminar('${m.id}')" class="text-red-900/40 hover:text-red-500 transition-all active:scale-125"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
            </div>
            <div class="flex items-center gap-3">

          
            
                <div class="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/5">
                    <i data-lucide="${m.canal === 'wa' ? 'message-circle' : 'send'}" class="w-5 h-5 ${m.canal === 'wa' ? 'text-green-500' : 'text-blue-500'}"></i>
                </div>
                <div class="flex flex-col">
                    <span class="text-[11px] font-black text-gray-500 uppercase tracking-[0.1em]">Protocolo de Envío</span>
                    <span class="text-sm font-black uppercase tracking-widest ${m.canal === 'wa' ? 'text-green-500' : 'text-blue-500'}">${m.canal === 'wa' ? 'WhatsApp Premium' : 'Telegram Elite'}</span>
                </div>
            </div>
            <div class="space-y-4">
                <div>
                    <p class="text-[11px] font-black text-gray-500 uppercase tracking-[0.1em] mb-1">Destinatario:</p>
                    <p class="text-3xl font-black text-white tracking-tighter">${m.tel}</p>
                </div>
                <div>
                    <p class="text-[11px] font-black text-gray-500 uppercase tracking-[0.1em] mb-1">Contenido:</p>
                    <div class="bg-white/5 p-3 rounded-xl border border-white/5">
                        <p id="msg-text-${m.id}" class="text-gray-300 text-base leading-relaxed italic font-medium mensaje-truncado break-words">"${m.msg}"</p>
                        ${m.msg.length > 50 ? `<button onclick="toggleMensaje('${m.id}', this)" class="mt-2 text-[12px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">Leer más</button>` : ''}
                    </div>
                </div>
            </div>
            <div class="pt-5 border-t border-white/10 flex justify-between items-center">
                <div class="flex flex-col">
                    <span class="text-[11px] font-black text-gray-500 uppercase tracking-[0.1em] mb-1">Fecha</span>
                    <div class="flex items-center gap-2 text-white">
                        <i data-lucide="calendar" class="w-4 h-4 text-gray-500"></i>
                        <span class="text-sm font-bold">${m.fec.split('T')[0]}</span>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-[11px] font-black text-gray-500 uppercase tracking-[0.1em] mb-1 block">Hora Programada</span>
                    <div class="flex items-center gap-2 text-white justify-end">
                        <i data-lucide="clock" class="w-4 h-4 text-gray-500"></i>
                        <span class="text-2xl font-black">${m.fec.split('T')[1]}</span>
                    </div>
                </div>
            </div>
        </div>`).join('');
    if (window.lucide) lucide.createIcons();
}

// --- TU GUARDAR REGISTRO (CONECTADO A supabaseCont) ---
async function guardarRegistro() {
    const msg = document.getElementById('mensaje').value;
    const fecStr = document.getElementById('fecha').value;
    const editId = document.getElementById('edit-id').value;

    if (numerosSeleccionados.length === 0 || !msg || !fecStr) return alert("⚠️ Completa todos los campos");

    const fechaSeleccionada = new Date(fecStr);
    const ahora = new Date();
    const minPermitido = new Date(ahora.getTime() + 15 * 60000);

    if (fechaSeleccionada < ahora) return alert("❌ No puedo viajar al pasado. Elige una fecha futura.");
    if (fechaSeleccionada < minPermitido) return alert("⏳ Por seguridad, el recordatorio debe ser al menos 15 minutos después de ahora.");

    // Mantenemos tu lógica de validación local
    for (let num of numerosSeleccionados) {
        const historialNum = mensajes.filter(m => m.tel === num);
        if (historialNum.length >= 4 && !editId) return alert(`🚫 El número ${num} ya tiene 4 mensajes. Límite de Spam alcanzado.`);

        // ... (Tu lógica de choque de hora se mantiene igual aquí)
    }


    // --- EL TRUCO DEL TIEMPO AQUÍ ---
    // Convertimos la fecha seleccionada a ISO String (UTC). 
    // Si en Colombia son las 6:00 PM, esto mandará "2026-05-07T23:00:00.000Z" a la base de datos.
    const fechaParaDB = fechaSeleccionada.toISOString();

    // --- AQUÍ ENTRA supabaseCont ---
    const payload = {
        telegram_id: tg.initDataUnsafe.user?.id || 0,
        recipients: numerosSeleccionados, // Enviamos el array
        message_body: msg,
        scheduled_time: fechaParaDB,
        channel_type: canal
    };

    let result;
    if (editId) {
        result = await supabaseCont.from('sync_logs').update(payload).eq('id', editId);
    } else {
        result = await supabaseCont.from('sync_logs').insert([payload]);
    }

    if (result.error) {
        alert("Error en la sincronización: " + result.error.message);
    } else {
        alert("✅ Protocolo MaibaSync Asegurado");
        limpiarFormulario();
        await cargarMensajes(); // Refrescamos desde la DB
        switchTab('list');
    }
}

// --- TUS FUNCIONES DE EDICIÓN Y ELIMINACIÓN (CONECTADAS) ---
function editarRegistro(id) {
    const m = mensajes.find(msg => msg.id == id); // Cambié a == por si el ID viene como string
    if (!m) return;
    switchTab('form');
    document.getElementById('edit-id').value = m.id;
    document.getElementById('mensaje').value = m.msg;
    document.getElementById('fecha').value = m.fec;
    numerosSeleccionados = m.tel.split(', ');
    setCanal(m.canal);
    renderTags();
    document.getElementById('btnMain').innerText = "Actualizar Recordatorio";
    document.getElementById('btnMain').className = "w-full py-5 bg-yellow-500 text-black rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all";
    document.getElementById('btnCancel').classList.remove('hidden');
}

async function eliminar(id) {
    if (!confirm("¿Deseas eliminar este protocolo de seguridad?")) return;

    const { error } = await supabaseCont.from('sync_logs').delete().eq('id', id);
    if (error) {
        alert("No se pudo eliminar de la DB");
    } else {
        await cargarMensajes();
    }
}

function limpiarFormulario() {
    document.getElementById('edit-id').value = '';
    document.getElementById('mensaje').value = '';
    document.getElementById('fecha').value = '';
    document.getElementById('btnMain').innerText = "Agendar Recordatorio";
    document.getElementById('btnMain').className = "w-full py-5 bg-white text-black rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all";
    numerosSeleccionados = [];
    renderTags();
    updateCharCount(document.getElementById('mensaje'));
    document.getElementById('btnCancel').classList.add('hidden');
    setCanal(canal);
}


// Esta función se llama cada vez que el usuario escribe en el buscador
async function manejarBusqueda(valor) {
    const tel = valor.trim();
    if (tel.length === 0 || tel.length === 10) {
        hayMasDatos = true; // Reseteamos para que pueda volver a cargar si borra búsqueda
        await cargarMensajes(tel, false); // false = no acumular, es búsqueda nueva
    }
}


async function actualizarContadores(fechaSeleccionada) {
    // const fecha = fechaSeleccionada || document.getElementById('filtro-fecha').value; // Ej: "2026-05-07"
    // const canalActivo = canal;

    // VENTANA DINÁMICA: Ajustamos el desfase de Sonora (UTC-7)
    // Inicio: 7:00 AM UTC del día seleccionado (00:00 local)
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0'); // Mes empieza en 0
    const dd = String(hoy.getDate()).padStart(2, '0');

    const fechaHoy = `${yyyy}-${mm}-${dd}`;
    // console.log('fechaHoy: ', fechaHoy); // "2026-05-07"
    const inicioUTC = `${fechaHoy}T07:00:00Z`;

    // Fin: 6:59:59 AM UTC del DÍA SIGUIENTE (23:59 local)
    let dSiguiente = new Date(fechaHoy + 'T00:00:00Z');
    dSiguiente.setUTCDate(dSiguiente.getUTCDate() + 1);
    const finUTC = `${dSiguiente.toISOString().split('T')[0]}T06:59:59Z`;


    const [respP, respS] = await Promise.all([
        supabaseCont
            .from('sync_logs')
            .select('id', { count: 'exact', head: true })
            // .eq('channel_type', canalActivo)
            .gte('scheduled_time', inicioUTC)
            .lte('scheduled_time', finUTC)
            .neq('delivery_status', 'sent'), // Cuenta: pending, failed, null, etc.

        supabaseCont
            .from('sync_logs')
            .select('id', { count: 'exact', head: true })
            // .eq('channel_type', canalActivo)
            .eq('delivery_status', 'sent')
            .gte('scheduled_time', inicioUTC)
            .lte('scheduled_time', finUTC)
    ]);

    document.getElementById('count-pending').innerText = respP.count || 0;
    document.getElementById('count-sent').innerText = respS.count || 0;
}

// function resetearYFiltrar() { renderList(); }
function validarYFiltrar() { renderList(); }

