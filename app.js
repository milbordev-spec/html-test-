if (!window.Telegram.WebApp.initData) {
    console.warn("🛠️ Estás fuera de Telegram. Usando datos de prueba.");
    window.Telegram.WebApp = {
        ready: () => { },
        showAlert: (msg) => alert("MOCK ALERT: " + msg),
        showConfirm: (msg, cb) => cb(confirm("MOCK CONFIRM: " + msg)),
        HapticFeedback: { impactOccurred: () => console.log("📳 Haptic!") }
    };
}



const tg = window.Telegram.WebApp;
let canal = 'wa';
let filtroActual = 'all';
let mensajes = JSON.parse(localStorage.getItem('maiba_msgs') || '[]');
let numerosSeleccionados = [];
let searchAbierto = false;

let paginaActual = 1;
const itemsPorPagina = 10;
let cargando = false;

const hoy = new Date();
const hoyF = hoy.getFullYear() + '-' +
    String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoy.getDate()).padStart(2, '0');

document.getElementById('filtro-fecha').value = hoyF;



// 1. Forzamos el estado inicial de la App
// 1. Forzamos el estado inicial de la App
function inicializarApp() {
    setCanal('wa'); // Esto asegura que solo WhatsApp inicie activo
    setFilter('all');
    renderList();
}

// 2. Corregimos setCanal para que limpie la otra pestaña
function setCanal(tipo) {
    canal = tipo;
    const isWa = tipo === 'wa';

    // Botones de selección de canal (Programar)
    const btnWa = document.getElementById('btn-wa');
    const btnTg = document.getElementById('btn-tg');

    if (isWa) {
        btnWa.className = 'flex-1 py-3 rounded-lg text-xs font-black bg-green-500 text-white uppercase flex items-center justify-center gap-2 shadow-lg transition-all';
        btnTg.className = 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase flex items-center justify-center gap-2 transition-all';
    } else {
        btnTg.className = 'flex-1 py-3 rounded-lg text-xs font-black bg-blue-500 text-white uppercase flex items-center justify-center gap-2 shadow-lg transition-all';
        btnWa.className = 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase flex items-center justify-center gap-2 transition-all';
    }

    document.getElementById('brand-sync').className = isWa ? 'text-green-500 text-4xl transition-colors duration-500' : 'text-blue-500 text-4xl transition-colors duration-500';
    updateThemeStyles(isWa);
}

// 3. Corregimos el filtrado (Pills) que estaba muerto
function setFilter(f) {
    filtroActual = f;
    const isWa = canal === 'wa';

    // Resetear clases de todos los pills
    ['all', 'wa', 'tg'].forEach(id => {
        const btn = document.getElementById(`f-${id}`);
        if (btn) btn.className = 'filter-pill px-5 py-2 rounded-full text-[10px] uppercase font-bold';
    });

    // Activar el pill seleccionado con el color del canal actual
    const activePill = document.getElementById(`f-${f}`);
    if (activePill) {
        activePill.classList.add(isWa ? 'active-wa' : 'active-tg');
    }

    resetearYFiltrar();
}

async function cargarSiguientePagina() {
    if (cargando) return;

    const fechaFiltro = document.getElementById('filtro-fecha').value;
    const telBusqueda = document.getElementById('busqueda-tel').value;

    let filtrados = mensajes.filter(m => {
        const coincideCanal = filtroActual === 'all' || m.canal === filtroActual;
        const coincideFecha = !fechaFiltro || m.fec.startsWith(fechaFiltro);
        const coincideTel = !telBusqueda || m.tel.includes(telBusqueda);
        return coincideCanal && coincideFecha && coincideTel;
    });

    if (paginaActual * itemsPorPagina >= filtrados.length) return;

    const loader = document.getElementById('loading-state');
    loader.classList.remove('hidden');
    cargando = true;

    await new Promise(resolve => setTimeout(resolve, 1200));

    paginaActual++;
    loader.classList.add('hidden');
    cargando = false;
    renderList(true);
}

window.onscroll = function () {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 100) {
        cargarSiguientePagina();
    }
};

function toggleSearch() {
    const container = document.getElementById('search-container');
    const input = document.getElementById('busqueda-tel');
    const icon = document.getElementById('search-icon');

    if (!searchAbierto) {
        container.style.width = '100%';
        input.classList.replace('opacity-0', 'opacity-100');
        input.focus();
        icon.setAttribute('data-lucide', 'x');
        if (window.lucide) lucide.createIcons();
        searchAbierto = true;
    } else {
        container.style.width = '48px';
        input.classList.replace('opacity-100', 'opacity-0');
        input.value = '';
        icon.setAttribute('data-lucide', 'search');
        if (window.lucide) lucide.createIcons();
        searchAbierto = false;
        resetearYFiltrar();
    }
}

function validarYFiltrar(input) {
    input.value = input.value.replace(/\D/g, '');
    const errorMsg = document.getElementById('error-busqueda');

    if (input.value.length === 10) {
        errorMsg.classList.add('hidden');
    } else if (input.value.length > 0) {
        errorMsg.classList.remove('hidden');
    } else {
        errorMsg.classList.add('hidden');
    }
    resetearYFiltrar();
}

function toggleMensaje(id, btn) {
    const p = document.getElementById(`msg-${id}`);
    const span = btn.querySelector('span');
    const svg = btn.querySelector('svg');

    if (p.classList.contains('line-clamp-2')) {
        p.classList.remove('line-clamp-2');
        span.innerText = "Ver menos";
        svg.style.transform = "rotate(180deg)";
    } else {
        p.classList.add('line-clamp-2');
        span.innerText = "Leer más";
        svg.style.transform = "rotate(0deg)";
    }
}

function resetearYFiltrar() {
    paginaActual = 1;
    cargando = false;
    const cont = document.getElementById('contenedor-mensajes');
    if (cont) cont.innerHTML = '';
    renderList();
}

function updateCharCount(el) {
    document.getElementById('char-count').innerText = `${el.value.length} / 500`;
}

function verificarReglasNegocio(num, fecStr, editId) {
    const soloFecha = fecStr.split('T')[0];
    const fechaNueva = new Date(fecStr);
    const fechaAhora = new Date();

    if (fechaNueva <= fechaAhora) {
        tg.showAlert("⚠️ No se puede crear un recordatorio en el pasado. Selecciona una fecha y hora futura.");
        return false;
    }

    const conteoDia = mensajes.filter(m => m.tel.includes(num) && m.fec.startsWith(soloFecha) && m.id != editId).length;
    if (conteoDia >= 5) {
        tg.showAlert(`❌ El número ${num} ya tiene 5 envíos para el día ${soloFecha}.`);
        return false;
    }

    const mensajeTexto = document.getElementById('mensaje').value.trim().toLowerCase();
    const esDuplicado = mensajes.some(m =>
        m.tel.includes(num) &&
        m.msg.trim().toLowerCase() === mensajeTexto &&
        m.id != editId
    );
    if (esDuplicado) {
        tg.showAlert("🚫 Contenido duplicado detectado para este número. Evita enviar el mismo mensaje dos veces.");
        return false;
    }

    const colision = mensajes.some(m => {
        if (m.id == editId) return false;
        if (m.tel.includes(num)) {
            const diff = Math.abs(new Date(m.fec) - fechaNueva) / (1000 * 60);
            return diff < 60;
        }
        return false;
    });
    if (colision) {
        tg.showAlert(`❌ Choque de horario: El número ${num} requiere al menos 1 hora de espacio entre envíos.`);
        return false;
    }
    return true;
}

function agregarNumeroTag() {
    const input = document.getElementById('telefono-input');
    const num = input.value.trim();
    const fecStr = document.getElementById('fecha').value;
    const editId = document.getElementById('edit-id').value;

    if (!/^\d{10}$/.test(num)) return tg.showAlert("El número debe tener 10 dígitos.");
    if (numerosSeleccionados.length >= 3) return tg.showAlert("Máximo 3 destinatarios.");
    if (numerosSeleccionados.includes(num)) return tg.showAlert("Este número ya está agregado.");
    if (!fecStr) return tg.showAlert("Selecciona primero la fecha.");

    if (verificarReglasNegocio(num, fecStr, editId)) {
        numerosSeleccionados.push(num);
        input.value = '';
        renderTags();
        tg.HapticFeedback.impactOccurred('medium');
    }
}

function renderTags() {
    const container = document.getElementById('tags-container');
    container.innerHTML = numerosSeleccionados.map(n => `
        <div class="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 animate-card">
            <span class="text-xs font-bold">${n}</span>
            <button onclick="eliminarTag('${n}')" class="text-red-400 font-black text-sm">✕</button>
        </div>
    `).join('');
}

function eliminarTag(num) {
    numerosSeleccionados = numerosSeleccionados.filter(n => n !== num);
    renderTags();
}

function setCanal(tipo) {
    canal = tipo;
    const isWa = tipo === 'wa';
    document.getElementById('btn-wa').className = isWa ? 'flex-1 py-3 rounded-lg text-xs font-black bg-green-500 text-white uppercase flex items-center justify-center gap-2 shadow-lg transition-all' : 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase flex items-center justify-center gap-2 transition-all';
    document.getElementById('btn-tg').className = !isWa ? 'flex-1 py-3 rounded-lg text-xs font-black bg-blue-500 text-white uppercase flex items-center justify-center gap-2 shadow-lg transition-all' : 'flex-1 py-3 rounded-lg text-xs font-black text-gray-500 uppercase flex items-center justify-center gap-2 transition-all';
    document.getElementById('brand-sync').className = isWa ? 'text-green-500 text-4xl transition-colors duration-500' : 'text-blue-500 text-4xl transition-colors duration-500';
    updateThemeStyles(isWa);
}

function updateThemeStyles(isWa) {
    const inputs = [document.getElementById('telefono-input'), document.getElementById('mensaje'), document.getElementById('fecha')];
    inputs.forEach(input => {
        if (input) {
            input.classList.remove('border-wa', 'border-tg');
            input.classList.add(isWa ? 'border-wa' : 'border-tg');
        }
    });
}

function switchTab(view) {
    document.getElementById('view-form').classList.toggle('hidden', view !== 'form');
    document.getElementById('view-list').classList.toggle('hidden', view !== 'list');
    const isWa = canal === 'wa';
    document.getElementById('tab-form').className = `flex-1 py-4 font-black text-xs tracking-widest uppercase transition-all ${view === 'form' ? (isWa ? 'tab-active-wa' : 'tab-active-tg') : 'text-gray-500'}`;
    document.getElementById('tab-list').className = `flex-1 py-4 font-black text-xs tracking-widest uppercase transition-all ${view === 'list' ? (isWa ? 'tab-active-wa' : 'tab-active-tg') : 'text-gray-500'}`;
    if (view === 'list') renderList();
}

function renderList(append = false) {
    const cont = document.getElementById('contenedor-mensajes');
    const fechaFiltro = document.getElementById('filtro-fecha').value;
    const telBusqueda = document.getElementById('busqueda-tel').value;
    const loader = document.getElementById('loading-state');
    const btnLoadMore = document.getElementById('btn-load-more-container');

    let filtrados = mensajes.filter(m => {
        const coincideCanal = filtroActual === 'all' || m.canal === filtroActual;
        const coincideFecha = !fechaFiltro || m.fec.startsWith(fechaFiltro);
        const coincideTel = !telBusqueda || m.tel.includes(telBusqueda);
        return coincideCanal && coincideFecha && coincideTel;
    });

    filtrados.sort((a, b) => new Date(a.fec) - new Date(b.fec));

    const fin = paginaActual * itemsPorPagina;
    const itemsAMostrar = filtrados.slice(0, fin);

    if (filtrados.length > itemsAMostrar.length) {
        if (btnLoadMore) btnLoadMore.classList.remove('hidden');
    } else {
        if (btnLoadMore) btnLoadMore.classList.add('hidden');
        if (loader) loader.classList.add('hidden');
    }

    if (itemsAMostrar.length === 0) {
        cont.innerHTML = `<div class="text-center py-20 text-gray-600 font-bold uppercase text-[10px] tracking-widest animate-pulse">${telBusqueda ? 'Sin coincidencias' : 'Sin registros'}</div>`;
        return;
    }

    cont.innerHTML = itemsAMostrar.map(m => {
        const esLargo = m.msg.length > 100;
        const ahora = new Date();
        const fechaMsg = new Date(m.fec);
        const diffMs = fechaMsg - ahora;
        const horasRestantes = Math.round(diffMs / (1000 * 60 * 60));

        let badgeColor = 'text-gray-400 bg-white/5';
        let statusText = 'En Cola';

        if (diffMs < 0) {
            badgeColor = 'text-blue-400 bg-blue-400/10 border border-blue-400/20';
            statusText = 'Ejecutado';
        } else if (horasRestantes <= 2) {
            badgeColor = 'text-orange-400 bg-orange-400/10 border border-orange-400/20';
            statusText = 'Próximo';
        }

        return `
            <div class="msg-card p-6 rounded-[2.5rem] space-y-4 animate-card relative overflow-hidden mb-4 border border-white/5 bg-white/[0.02]">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <span class="flex h-1.5 w-1.5 rounded-full ${m.canal === 'wa' ? 'bg-green-500' : 'bg-blue-500'} ${diffMs > 0 ? 'animate-pulse' : ''}"></span>
                        <span class="text-[9px] font-black ${m.canal === 'wa' ? 'text-green-400/80' : 'text-blue-400/80'} uppercase tracking-[0.2em]">
                            ${m.canal === 'wa' ? 'WhatsApp Gateway' : 'Telegram Protocol'}
                        </span>
                    </div>
                    <div class="flex gap-2 bg-black/40 p-1.5 rounded-xl border border-white/5">
                        <button onclick="editar(${m.id})" class="p-1 hover:bg-white/10 rounded-lg transition-colors text-xs">✏️</button>
                        <button onclick="eliminar(${m.id})" class="p-1 hover:bg-red-500/20 rounded-lg transition-colors text-xs">🗑️</button>
                    </div>
                </div>
                <div class="space-y-0.5">
                    <p class="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Destinatario</p>
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center border border-white/10">
                            <i data-lucide="phone" class="w-4 h-4 text-gray-400"></i>
                        </div>
                        <p class="text-lg font-black text-white tracking-tight">${m.tel}</p>
                    </div>
                </div>
                <div class="bg-black/20 p-4 rounded-2xl border border-white/5 group relative">
                    <p id="msg-${m.id}" class="text-gray-300 text-sm font-medium leading-relaxed break-words line-clamp-2 transition-all duration-500">
                        "${m.msg}"
                    </p>
                    ${esLargo ? `<button onclick="toggleMensaje(${m.id}, this)" class="mt-3 text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-1 hover:text-white transition-colors"><span>Leer más</span><i data-lucide="chevron-down" class="w-3 h-3 transition-transform duration-300"></i></button>` : ''}
                </div>
                <div class="flex justify-between items-center pt-3 border-t border-white/5">
                    <div class="flex items-center gap-2 text-gray-500">
                        <i data-lucide="calendar" class="w-3 h-3"></i>
                        <span class="text-[11px] font-bold tracking-tight">
                            ${m.fec.split('T')[0]} <span class="text-gray-700 mx-1">|</span> ${m.fec.split('T')[1]}
                        </span>
                    </div>
                    <span class="px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${badgeColor}">
                        ${statusText}
                    </span>
                </div>
            </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// ESTA LÍNEA ES LA QUE DISPARA EL RENDERIZADO INICIAL Y HACE QUE EL LOADING SE GESTIONE

// Ejecutamos la configuración inicial cuando carga el archivo
document.addEventListener('DOMContentLoaded', inicializarApp);
// Por si el DOM ya cargó (Telegram a veces es caprichoso):
inicializarApp();
renderList();