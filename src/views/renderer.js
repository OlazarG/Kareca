let currentUser = null;
let authToken = localStorage.getItem('authToken');
let currentAnioLectivo = new Date().getFullYear();
let searchDebounce = null;
let selectedCobroAlumno = null;
let selectedCuotaId = null;
let pendingPagoData = null;
let pagoModal = null;

function formatMoney(num) {
    if (num == null || isNaN(num)) return 'Gs. 0';
    return 'Gs. ' + Number(num).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

function formatDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('es-PY');
}

function $(id) { return document.getElementById(id); }

function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatCurrencyInput(input) {
    const cursor = input.selectionStart;
    const digitsBefore = input.value.slice(0, cursor).replace(/\D/g, '').length;
    const raw = input.value.replace(/\D/g, '');
    const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (input.value !== formatted) {
        input.value = formatted;
        let newPos = 0, count = 0;
        for (let i = 0; i < formatted.length; i++) {
            if (count >= digitsBefore) break;
            if (formatted[i] >= '0' && formatted[i] <= '9') count++;
            newPos = i + 1;
        }
        input.setSelectionRange(newPos, newPos);
    }
}

async function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { logout(); throw new Error('Sesion expirada'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Error en la solicitud');
    return data;
}

// ==================== AUTH ====================
async function handleLogin(e) {
    e.preventDefault();
    const username = $('login-username')?.value?.trim();
    const password = $('login-password')?.value;
    if (!username || !password) return Swal.fire({ icon: 'warning', title: 'Campos vacíos', text: 'Ingrese usuario y contraseña', confirmButtonColor: '#3085d6' });
    try {
        const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        if (!data.success) {
            const icon = data.message?.includes('no encontrado') ? 'error' : 'warning';
            return Swal.fire({ icon, title: 'Inicio de sesión fallido', text: data.message || 'Credenciales inválidas', confirmButtonColor: '#3085d6' });
        }
        authToken = data.token;
        localStorage.setItem('authToken', authToken);
        currentUser = data.user;
        $('login-overlay').style.display = 'none';
        document.querySelector('.main-wrapper').style.display = 'flex';
        $('logged-username').textContent = currentUser.username || '';
        $('logged-userrole').textContent = currentUser.role_name || '';
        loadDashboard();
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error de conexión', text: err.message || 'No se pudo conectar al servidor', confirmButtonColor: '#3085d6' });
    }
}

function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
    }).catch(() => {});
    authToken = null;
    localStorage.removeItem('authToken');
    currentUser = null;
    document.querySelector('.main-wrapper').style.display = 'none';
    $('login-overlay').style.display = 'flex';
    $('login-username').value = '';
    $('login-password').value = '';
}

// ==================== NAVIGATION ====================
const sectionLoaders = {
    dashboard: loadDashboard,
    cobros: () => { loadCobrosRecientes(); loadCobrosResponsables(); },
    caja: checkCajaStatus,
    alumnos: loadAlumnos,
    cursos: loadCursos,
    'alumnos-por-curso': () => { loadAlumnosPorCursoDropdown(); togglePeriodoFilterAPC(); loadAlumnosPorCurso(); },
    responsables: loadResponsables,
    matriculas: () => { loadMatriculas(); loadMatriculasCursosDropdown(); },
    morosidad: () => { loadMorosidadFiltros(); loadMorosidad(); },
    reportes: loadReportes,
    usuarios: loadUsers
};

function showSection(name) {
    const allSections = document.querySelectorAll('[id$="-section"]');
    allSections.forEach(s => s.style.display = 'none');
    const target = $(name + '-section');
    if (target) target.style.display = '';
    document.querySelectorAll('.sidebar a[id^="nav-"]').forEach(l => l.classList.remove('active'));
    const navLink = $('nav-' + name);
    if (navLink) navLink.classList.add('active');
    if (window.innerWidth <= 768) {
        $('sidebar')?.classList.remove('open');
        document.querySelector('.sidebar-backdrop')?.classList.remove('open');
    }
    if (sectionLoaders[name]) sectionLoaders[name]();
}

function toggleSidebar() {
    $('sidebar')?.classList.toggle('open');
    document.querySelector('.sidebar-backdrop')?.classList.toggle('open');
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    $('dash-date').textContent = new Date().toLocaleDateString('es-PY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    try {
        const stats = await apiFetch(`/api/reportes/estadisticas?anio_lectivo=${currentAnioLectivo}`);
        $('dash-alumnos').textContent = stats.totalAlumnos || 0;
        $('dash-cobrado').textContent = formatMoney(stats.totalCobrado || 0);
        $('dash-deudores').textContent = stats.totalDeudores || 0;
        $('dash-deuda-total').textContent = formatMoney(stats.deudaTotal || 0);
    } catch (e) { console.error('Dashboard stats error:', e); }
    try {
        const deud = await apiFetch(`/api/reportes/deudores?anio_lectivo=${currentAnioLectivo}`);
        const tbody = $('dash-deudores-body');
        tbody.innerHTML = '';
        (deud.deudores || []).slice(0, 10).forEach(d => {
            tbody.innerHTML += `<tr>
                <td>${esc(d.nombre || '')} ${esc(d.apellido || '')}</td>
                <td>${esc(d.curso || '')}</td>
                <td>${esc(d.cuotas_vencidas || 0)}</td>
                <td>-</td>
                <td>${formatMoney(d.deuda_total || 0)}</td>
                <td class="text-end"><button class="btn btn-sm btn-outline-success" onclick="showSection('cobros')"><i class="bi bi-cash"></i></button></td>
            </tr>`;
        });
    } catch (e) { console.error('Dashboard deudores error:', e); }
}

// ==================== ALUMNOS ====================
async function loadAlumnos(search = '', page = 1) {
    try {
        const data = await apiFetch(`/api/alumnos?search=${encodeURIComponent(search)}&page=${page}&limit=20`);
        const tbody = $('alumnos-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.rows || []).forEach(a => {
            tbody.innerHTML += `<tr>
                <td>${esc(a.id)}</td>
                <td>${esc(a.nombre || '')}</td>
                <td>${esc(a.apellido || '')}</td>
                <td>${esc(a.dni || '')}</td>
                <td>${esc(a.email || '')}</td>
                <td>${esc(a.telefono || '')}</td>
                <td><span class="badge bg-${a.estado === 'activo' ? 'success' : 'secondary'}">${esc(a.estado || 'activo')}</span></td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editAlumno(${esc(a.id)})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAlumno(${esc(a.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });
        renderPagination('alumnos-pagination', data.totalPages, data.page, (p) => loadAlumnos(search, p));
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function editAlumno(id) {
    try {
        const data = await apiFetch(`/api/alumnos/${id}`);
        const a = data.alumno || data;
        $('edit-alumno-id').value = a.id;
        $('alumno-nombre').value = a.nombre || '';
        $('alumno-apellido').value = a.apellido || '';
        $('alumno-dni').value = a.dni || '';
        $('alumno-nacimiento').value = a.fecha_nacimiento ? a.fecha_nacimiento.split('T')[0] : '';
        $('alumno-email').value = a.email || '';
        $('alumno-telefono').value = a.telefono || '';
        $('alumno-direccion').value = a.direccion || '';
        $('alumno-observaciones').value = a.observaciones || '';
        $('alumno-estado').value = a.estado || 'activo';
        $('alumno-form-title').textContent = 'Editar Alumno';
        $('btn-cancel-edit-alumno').style.display = '';
        $('btn-save-alumno').textContent = 'Actualizar Alumno';
        const collapse = bootstrap.Collapse.getOrCreateInstance($('alumnoFormCollapse'));
        collapse.show();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function deleteAlumno(id) {
    const r = await Swal.fire({ title: 'Eliminar alumno?', icon: 'question', showCancelButton: true, confirmButtonText: 'Si, eliminar' });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/alumnos/${id}`, { method: 'DELETE' });
        Swal.fire('Eliminado', '', 'success');
        loadAlumnos();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function resetAlumnoForm() {
    $('form-alumno')?.reset();
    $('edit-alumno-id').value = '';
    $('alumno-form-title').textContent = 'Registrar Nuevo Alumno';
    $('btn-cancel-edit-alumno').style.display = 'none';
    $('btn-save-alumno').textContent = 'Guardar Alumno';
}

// ==================== CURSOS ====================
function resetCursoForm() {
    $('form-curso')?.reset();
    $('edit-curso-id').value = '';
    $('curso-form-title').textContent = 'Registrar Nuevo Curso';
    $('btn-cancel-edit-curso').style.display = 'none';
    $('btn-save-curso').textContent = 'Guardar Curso';
    $('curso-dia-venc').value = '10';
    $('curso-activo').value = '1';
    $('curso-numero-resolucion').value = '';
    $('curso-documento-tipo').value = '';
    ['matricula', 'examen-parcial', 'examen-complementario', 'extra-ordinario', 'documento'].forEach(k => {
        const t = $(`curso-${k}-total`);
        if (t) t.textContent = 'Gs. 0';
    });
}

function docLabel(t) {
    if (t === 'TITULO') return 'Título';
    if (t === 'CERTIFICACION') return 'Certificación';
    if (t === 'CONSTANCIA') return 'Constancia';
    return '';
}

function calcCursoTotal(key) {
    const mec = parseFloat($(`curso-${key}-mec`)?.value?.replace(/\./g, '')) || 0;
    const inst = parseFloat($(`curso-${key}-inst`)?.value?.replace(/\./g, '')) || 0;
    const total = $(`curso-${key}-total`);
    if (total) total.textContent = 'Gs. ' + (mec + inst).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

async function loadCursos() {
    const batchBtn = $('btn-batch-edit-cursos');
    if (batchBtn) batchBtn.style.display = '';

    try {
        const data = await apiFetch(`/api/cursos?anio_lectivo=${currentAnioLectivo}`);
        const container = $('cursos-container');
        if (!container) return;
        container.innerHTML = '';
        (data.cursos || []).forEach(c => {
            container.innerHTML += `<div class="col-md-4 mb-3">
                <div class="card card-custom h-100">
                    <div class="card-body">
                        <h5 class="card-title fw-bold">${esc(c.nombre)}</h5>
                        <p class="mb-1"><small class="text-muted">Nivel: ${esc(c.nivel || '-')} | Turno: ${esc(c.turno || '-')} | Ano: ${c.anio_lectivo || currentAnioLectivo}</small></p>
                        <p class="mb-1"><small>Cuota: ${formatMoney(c.cuota_mensual || 0)}</small></p>
                        <p class="mb-1"><small class="text-muted">Venc: dia ${esc(c.dia_vencimiento || 10)} | Mora: ${esc(c.recargo_mora_pct || 0)}%</small></p>
                        <p class="mb-1"><small>Matrícula: ${formatMoney(c.matricula_monto || 0)}</small></p>
                        <p class="mb-1"><small>Parcial: ${formatMoney(c.examen_parcial_monto || 0)} | Compl: ${formatMoney(c.examen_complementario_monto || 0)} | Extra: ${formatMoney(c.extra_ordinario_monto || 0)}</small></p>
                        ${c.documento_expedido ? `<p class="mb-1"><small class="text-success"><i class="bi bi-award me-1"></i>${docLabel(c.documento_expedido)}: ${formatMoney(c.documento_monto || 0)}</small></p>` : ''}
                        ${c.numero_resolucion ? `<p class="mb-1"><small class="text-info">Resolución: ${esc(c.numero_resolucion)}</small></p>` : ''}
                        <span class="badge bg-${c.activo ? 'success' : 'secondary'} mb-2">${c.activo ? 'Activo' : 'Inactivo'}</span>
                        <span class="badge bg-info mb-2">${c.alumno_count || 0} alumnos</span>
                        <span class="badge bg-secondary mb-2">${c.tipo_periodo === 'SEMESTRAL' ? 'Semestral' : 'Anual'}</span>
                        <div class="d-flex gap-1 mt-2">
                            <button class="btn btn-sm btn-outline-primary" onclick="verAlumnosCurso(${esc(c.id)}, '${(c.nombre || '').replace(/'/g, "\\'")}', ${c.anio_lectivo || currentAnioLectivo}, '${c.tipo_periodo || 'ANUAL'}')" title="Ver alumnos matriculados"><i class="bi bi-people"></i> Alumnos</button>
                            <button class="btn btn-sm btn-info" onclick="showCuotasCurso(${esc(c.id)}, '${(c.nombre || '').replace(/'/g, "\\'")}', ${c.anio_lectivo || currentAnioLectivo})"><i class="bi bi-list-check"></i> Cuotas</button>
                            <button class="btn btn-sm btn-outline-secondary" onclick="verHistorialCurso(${esc(c.id)}, '${(c.nombre || '').replace(/'/g, "\\'")}')" title="Ver historial de costos"><i class="bi bi-clock-history"></i></button>
                            <button class="btn btn-sm btn-warning" onclick="editCurso(${esc(c.id)})"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="deleteCurso(${esc(c.id)})"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>`;
        });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function editCurso(id) {
    try {
        const data = await apiFetch(`/api/cursos/${id}`);
        const c = data.curso || data;
        $('edit-curso-id').value = c.id;
        $('curso-nombre').value = c.nombre || '';
        $('curso-nivel').value = c.nivel || 'Primaria';
        $('curso-turno').value = c.turno || 'Manana';
        $('curso-anio').value = c.anio_lectivo || currentAnioLectivo;
        $('curso-dia-venc').value = c.dia_vencimiento || 10;
        $('curso-activo').value = c.activo ? '1' : '0';
        $('curso-tipo-periodo').value = c.tipo_periodo || 'ANUAL';
        const fmt = (v) => v ? Number(v).toLocaleString('es-PY', { maximumFractionDigits: 0 }) : '';
        $('curso-cuota-mensual').value = fmt(c.cuota_mensual);
        $('curso-mora-pct').value = c.recargo_mora_pct || 0;
        $('curso-numero-resolucion').value = c.numero_resolucion || '';
        $('curso-documento-tipo').value = c.documento_expedido || '';
        const costFields = [
            ['matricula', c.matricula_mec, c.matricula_inst],
            ['examen-parcial', c.examen_parcial_mec, c.examen_parcial_inst],
            ['examen-complementario', c.examen_complementario_mec, c.examen_complementario_inst],
            ['extra-ordinario', c.extra_ordinario_mec, c.extra_ordinario_inst],
            ['documento', c.documento_mec, c.documento_inst]
        ];
        costFields.forEach(([key, mec, inst]) => {
            const me = $(`curso-${key}-mec`); if (me) me.value = fmt(mec);
            const ie = $(`curso-${key}-inst`); if (ie) ie.value = fmt(inst);
            calcCursoTotal(key);
        });
        $('curso-form-title').textContent = 'Editar Curso';
        $('btn-cancel-edit-curso').style.display = '';
        $('btn-save-curso').textContent = 'Actualizar Curso';
        const collapse = bootstrap.Collapse.getOrCreateInstance($('cursoFormCollapse'));
        collapse.show();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function deleteCurso(id) {
    const r = await Swal.fire({ title: 'Eliminar curso?', icon: 'question', showCancelButton: true, confirmButtonText: 'Si, eliminar' });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/cursos/${id}`, { method: 'DELETE' });
        Swal.fire('Eliminado', '', 'success');
        loadCursos();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function batchEditCursos() {
    try {
        const data = await apiFetch(`/api/cursos?anio_lectivo=${currentAnioLectivo}`);
        const cursos = data.cursos || [];
        if (cursos.length === 0) return Swal.fire('Sin cursos', 'No hay cursos para editar', 'info');

        const html = `
            <div class="text-start" style="max-height:70vh;overflow-y:auto;">
                <div class="mb-2">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="document.querySelectorAll('.curso-batch-chk').forEach(c=>c.checked=true)">Seleccionar Todos</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="document.querySelectorAll('.curso-batch-chk').forEach(c=>c.checked=false)">Deseleccionar</button>
                </div>
                <div class="row mb-3 border-bottom pb-2">
                    ${cursos.map(c => `
                        <div class="col-6 col-md-4">
                            <label class="d-flex align-items-center gap-1 small">
                                <input type="checkbox" class="curso-batch-chk" value="${c.id}" checked>
                                ${esc(c.nombre)} (${c.anio_lectivo})
                            </label>
                        </div>
                    `).join('')}
                </div>
                <h6 class="fw-bold">Campos a actualizar (dejar vacío para no modificar)</h6>
                <div class="row g-2">
                    <div class="col-md-4"><label class="form-label small">Cuota Mensual</label><input class="form-control form-control-sm currency-input batch-field" data-key="cuota_mensual" placeholder="Ej: 300.000"></div>
                    <div class="col-md-4"><label class="form-label small">Mora %</label><input class="form-control form-control-sm batch-field" data-key="recargo_mora_pct" placeholder="Ej: 5"></div>
                    <div class="col-md-4"><label class="form-label small">Día Vencimiento</label><input class="form-control form-control-sm batch-field" data-key="dia_vencimiento" placeholder="Ej: 15"></div>
                    <div class="col-md-4">
                        <label class="form-label small">Estado</label>
                        <select class="form-select form-select-sm batch-field" data-key="activo">
                            <option value="">Sin cambios</option>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small">Tipo de Período</label>
                        <select class="form-select form-select-sm batch-field" data-key="tipo_periodo">
                            <option value="">Sin cambios</option>
                            <option value="ANUAL">Anual</option>
                            <option value="SEMESTRAL">Semestral</option>
                        </select>
                    </div>
                    <div class="col-md-4"><label class="form-label small">N° Resolución</label><input class="form-control form-control-sm batch-field" data-key="numero_resolucion" placeholder="Ej: RES-123/2026"></div>
                </div>
                <h6 class="fw-bold mt-3">Costos (MEC / Instituto)</h6>
                <div class="row g-2">
                    <div class="col-md-3"><label class="form-label small">Matrícula MEC</label><input class="form-control form-control-sm currency-input batch-field" data-key="matricula_mec" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Matrícula INST</label><input class="form-control form-control-sm currency-input batch-field" data-key="matricula_inst" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Parcial MEC</label><input class="form-control form-control-sm currency-input batch-field" data-key="examen_parcial_mec" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Parcial INST</label><input class="form-control form-control-sm currency-input batch-field" data-key="examen_parcial_inst" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Complementario MEC</label><input class="form-control form-control-sm currency-input batch-field" data-key="examen_complementario_mec" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Complementario INST</label><input class="form-control form-control-sm currency-input batch-field" data-key="examen_complementario_inst" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Extra Ord. MEC</label><input class="form-control form-control-sm currency-input batch-field" data-key="extra_ordinario_mec" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Extra Ord. INST</label><input class="form-control form-control-sm currency-input batch-field" data-key="extra_ordinario_inst" placeholder="0"></div>
                    <div class="col-md-3">
                        <label class="form-label small">Documento Tipo</label>
                        <select class="form-select form-select-sm batch-field" data-key="documento_expedido">
                            <option value="">Sin cambios</option>
                            <option value="TITULO">Título</option>
                            <option value="CERTIFICACION">Certificación</option>
                            <option value="CONSTANCIA">Constancia</option>
                        </select>
                    </div>
                    <div class="col-md-3"><label class="form-label small">Documento MEC</label><input class="form-control form-control-sm currency-input batch-field" data-key="documento_mec" placeholder="0"></div>
                    <div class="col-md-3"><label class="form-label small">Documento INST</label><input class="form-control form-control-sm currency-input batch-field" data-key="documento_inst" placeholder="0"></div>
                </div>
            </div>
        `;

        const { value: confirmed } = await Swal.fire({
            title: 'Edición Masiva de Cursos',
            html,
            width: 800,
            showCancelButton: true,
            confirmButtonText: 'Actualizar Cursos',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const checked = [...document.querySelectorAll('.curso-batch-chk:checked')].map(c => parseInt(c.value));
                if (checked.length === 0) return Swal.showValidationMessage('Seleccione al menos un curso');

                const campos = {};
                document.querySelectorAll('.batch-field').forEach(el => {
                    const val = el.value.trim();
                    if (val === '') return;
                    const key = el.dataset.key;
                    if (key === 'activo') campos[key] = val === 'true';
                    else if (['dia_vencimiento'].includes(key)) campos[key] = parseInt(val);
                    else if (['cuota_mensual', 'matricula_mec', 'matricula_inst', 'examen_parcial_mec', 'examen_parcial_inst', 'examen_complementario_mec', 'examen_complementario_inst', 'extra_ordinario_mec', 'extra_ordinario_inst', 'documento_mec', 'documento_inst'].includes(key)) campos[key] = parseFloat(val.replace(/\./g, '')) || 0;
                    else if (key === 'recargo_mora_pct') campos[key] = parseFloat(val) || 0;
                    else campos[key] = val;
                });

                if (Object.keys(campos).length === 0) return Swal.showValidationMessage('Complete al menos un campo a actualizar');
                return { curso_ids: checked, campos };
            }
        });

        if (!confirmed) return;

        await apiFetch('/api/cursos/batch', {
            method: 'PUT',
            body: JSON.stringify(confirmed)
        });
        Swal.fire('Exito', `Cursos actualizados correctamente`, 'success');
        loadCursos();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== ALUMNOS POR CURSO ====================
async function loadAlumnosPorCursoDropdown() {
    try {
        const data = await apiFetch(`/api/cursos?anio_lectivo=${$('apc-anio')?.value || currentAnioLectivo}`);
        const select = $('apc-curso-id');
        if (!select) return;
        select.innerHTML = '<option value="">Todos los cursos</option>';
        (data.cursos || []).forEach(c => {
            select.innerHTML += `<option value="${esc(c.id)}" data-tipo-periodo="${c.tipo_periodo || 'ANUAL'}">${esc(c.nombre)} - ${esc(c.nivel || '')} (${c.anio_lectivo})</option>`;
        });
    } catch (e) { console.error(e); }
}

function togglePeriodoFilterAPC() {
    const select = $('apc-curso-id');
    const col = $('apc-periodo-col');
    if (!select || !col) return;
    const opt = select.options[select.selectedIndex];
    const esSemestral = opt?.dataset?.tipoPeriodo === 'SEMESTRAL';
    col.style.display = esSemestral ? '' : 'none';
    if (!esSemestral) $('apc-periodo').value = '';
    loadAlumnosPorCurso();
}

async function loadAlumnosPorCurso() {
    const cursoId = $('apc-curso-id')?.value;
    const anio = parseInt($('apc-anio')?.value) || currentAnioLectivo;
    const periodo = $('apc-periodo')?.value || '';

    $('apc-curso-label').textContent = cursoId ? '' : 'Mostrando todos los cursos';
    $('apc-count').textContent = '0';

    const tbody = $('apc-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">Cargando...</td></tr>';

    try {
        let alumnos = [];
        if (cursoId) {
            let url = `/api/cursos/${cursoId}/alumnos?anio_lectivo=${anio}`;
            if (periodo) url += `&periodo=${periodo}`;
            const data = await apiFetch(url);
            alumnos = data.alumnos || [];
            const cursoName = document.querySelector(`#apc-curso-id option[value="${cursoId}"]`)?.textContent || '';
            $('apc-curso-label').textContent = cursoName;
        } else {
            let url = `/api/matriculas?anio_lectivo=${anio}`;
            if (periodo) url += `&periodo=${periodo}`;
            const data = await apiFetch(url);
            const matriculas = data.matriculas || [];
            const map = new Map();
            matriculas.forEach(m => {
                const key = m.alumno_id + '|' + (periodo ? m.periodo : '');
                if (!map.has(key)) {
                    map.set(key, {
                        id: m.alumno_id,
                        nombre: m.alumno_nombre || '',
                        apellido: m.alumno_apellido || '',
                        dni: m.alumno_dni || '',
                        telefono: '',
                        email: '',
                        estado: 'activo',
                        periodo: m.periodo || 1,
                        fecha_inscripcion: m.fecha_matricula || m.fecha_inscripcion || ''
                    });
                }
            });
            alumnos = Array.from(map.values());
            $('apc-curso-label').textContent = 'Todos los cursos';
        }

        $('apc-count').textContent = alumnos.length;
        tbody.innerHTML = '';

        if (alumnos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No se encontraron alumnos</td></tr>';
            return;
        }

        alumnos.forEach((a, i) => {
            tbody.innerHTML += `<tr>
                <td>${i + 1}</td>
                <td>${esc(a.apellido || '')}</td>
                <td>${esc(a.nombre || '')}</td>
                <td>${esc(a.dni || '')}</td>
                <td>${esc(a.telefono || '')}</td>
                <td>${esc(a.email || '')}</td>
                <td><span class="badge bg-${(a.estado || 'activo') === 'activo' ? 'success' : 'secondary'}">${esc(a.estado || 'activo')}</span></td>
                <td>${a.periodo ? 'Sem ' + a.periodo : '-'}</td>
                <td>${formatDate(a.fecha_inscripcion)}</td>
            </tr>`;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-4">Error al cargar: ' + esc(e.message) + '</td></tr>';
    }
}

function exportAlumnosCursoCSV() {
    const rows = document.querySelectorAll('#apc-table-body tr');
    if (!rows.length || rows.length === 1 && rows[0].querySelector('td[colspan]')) {
        return Swal.fire('Sin datos', 'No hay alumnos para exportar', 'info');
    }
    let csv = '\uFEFFApellido,Nombre,DNI,Teléfono,Email,Estado,Período,Fecha Inscripción\n';
    rows.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        if (!tds.length || tds[0].hasAttribute('colspan')) return;
        const cells = [];
        for (let i = 1; i < tds.length; i++) {
            let val = tds[i].textContent.trim().replace(/"/g, '""');
            cells.push(`"${val}"`);
        }
        if (cells.length) csv += cells.join(',') + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `alumnos-por-curso-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ==================== ALUMNOS POR TECNICATURA (MODAL) ====================
let verAlumnosCursoState = null;

function verAlumnosCurso(cursoId, nombre, anio, tipoPeriodo) {
    verAlumnosCursoState = { cursoId, nombre, anio, tipoPeriodo, page: 1, limit: 10, total: 0, totalPages: 1 };
    const esSemestral = tipoPeriodo === 'SEMESTRAL';
    const periodoHtml = esSemestral
        ? `<select id="vac-periodo" class="form-select form-select-sm" style="width:auto">
               <option value="">Todos</option>
               <option value="1">1er Semestre</option>
               <option value="2">2do Semestre</option>
           </select>`
        : '<input type="hidden" id="vac-periodo" value="">';

    Swal.fire({
        title: `Alumnos de ${esc(nombre)}`,
        html: `
            <div class="d-flex gap-2 align-items-center justify-content-center mb-3 flex-wrap">
                <input type="number" id="vac-anio" class="form-control form-control-sm" style="width:110px" value="${esc(anio)}">
                ${periodoHtml}
                <button class="btn btn-sm btn-primary" id="vac-refresh"><i class="bi bi-search"></i> Buscar</button>
                <button class="btn btn-sm btn-outline-secondary" id="vac-csv"><i class="bi bi-download"></i> CSV</button>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div class="text-start"><strong id="vac-count">0</strong> alumnos encontrados</div>
                <div class="d-flex align-items-center gap-2">
                    <span class="text-muted small">Mostrar</span>
                    <select id="vac-limit" class="form-select form-select-sm" style="width:auto">
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                    <span class="text-muted small">por página</span>
                </div>
            </div>
            <div class="table-responsive text-start" style="max-height:62vh;overflow-y:auto;">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>#</th><th>Apellido</th><th>Nombre</th><th>DNI</th><th>Teléfono</th><th>Email</th><th>Estado</th><th>Período</th><th>Fecha Inscripción</th>
                        </tr>
                    </thead>
                    <tbody id="vac-table-body"><tr><td colspan="9" class="text-muted">Cargando...</td></tr></tbody>
                </table>
            </div>
            <div class="d-flex justify-content-center align-items-center gap-3 mt-2">
                <button class="btn btn-sm btn-outline-secondary" id="vac-prev"><i class="bi bi-chevron-left"></i> Anterior</button>
                <span class="small text-muted" id="vac-page-info">Página 1 de 1</span>
                <button class="btn btn-sm btn-outline-secondary" id="vac-next">Siguiente <i class="bi bi-chevron-right"></i></button>
            </div>`,
        width: 'min(1250px, 96vw)',
        showConfirmButton: false,
        didOpen: () => {
            document.getElementById('vac-refresh').addEventListener('click', () => {
                verAlumnosCursoState.page = 1;
                loadVerAlumnosCurso();
            });
            document.getElementById('vac-csv').addEventListener('click', exportVerAlumnosCursoCSV);
            document.getElementById('vac-prev').addEventListener('click', () => {
                if (verAlumnosCursoState.page > 1) {
                    verAlumnosCursoState.page--;
                    loadVerAlumnosCurso();
                }
            });
            document.getElementById('vac-next').addEventListener('click', () => {
                if (verAlumnosCursoState.page < verAlumnosCursoState.totalPages) {
                    verAlumnosCursoState.page++;
                    loadVerAlumnosCurso();
                }
            });
            document.getElementById('vac-limit').addEventListener('change', () => {
                verAlumnosCursoState.limit = parseInt(document.getElementById('vac-limit').value) || 10;
                verAlumnosCursoState.page = 1;
                loadVerAlumnosCurso();
            });
            loadVerAlumnosCurso();
        }
    });
}

async function loadVerAlumnosCurso() {
    if (!verAlumnosCursoState) return;
    const anio = parseInt(document.getElementById('vac-anio')?.value) || verAlumnosCursoState.anio;
    const periodo = document.getElementById('vac-periodo')?.value || '';
    const tbody = document.getElementById('vac-table-body');
    const countEl = document.getElementById('vac-count');
    const pageInfoEl = document.getElementById('vac-page-info');
    const prevBtn = document.getElementById('vac-prev');
    const nextBtn = document.getElementById('vac-next');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Cargando...</td></tr>';
    try {
        let url = `/api/cursos/${verAlumnosCursoState.cursoId}/alumnos?anio_lectivo=${anio}&page=${verAlumnosCursoState.page}&limit=${verAlumnosCursoState.limit}`;
        if (periodo) url += `&periodo=${periodo}`;
        const data = await apiFetch(url);
        const alumnos = data.alumnos || [];
        verAlumnosCursoState.total = data.total || alumnos.length;
        verAlumnosCursoState.totalPages = data.totalPages || 1;
        verAlumnosCursoState.page = data.page || 1;
        if (countEl) countEl.textContent = verAlumnosCursoState.total;
        if (pageInfoEl) pageInfoEl.textContent = `Página ${verAlumnosCursoState.page} de ${verAlumnosCursoState.totalPages}`;
        if (prevBtn) prevBtn.disabled = verAlumnosCursoState.page <= 1;
        if (nextBtn) nextBtn.disabled = verAlumnosCursoState.page >= verAlumnosCursoState.totalPages;
        const inicio = (verAlumnosCursoState.page - 1) * verAlumnosCursoState.limit + 1;
        tbody.innerHTML = '';
        if (alumnos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No se encontraron alumnos</td></tr>';
            return;
        }
        alumnos.forEach((a, i) => {
            tbody.innerHTML += `<tr>
                <td>${inicio + i}</td>
                <td>${esc(a.apellido || '')}</td>
                <td>${esc(a.nombre || '')}</td>
                <td>${esc(a.dni || '')}</td>
                <td>${esc(a.telefono || '')}</td>
                <td>${esc(a.email || '')}</td>
                <td><span class="badge bg-${(a.estado || 'ACTIVO') === 'ACTIVO' ? 'success' : 'secondary'}">${esc(a.estado || 'ACTIVO')}</span></td>
                <td>${a.periodo ? 'Sem ' + a.periodo : '-'}</td>
                <td>${formatDate(a.fecha_inscripcion)}</td>
            </tr>`;
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-danger">Error: ${esc(e.message)}</td></tr>`;
    }
}

async function exportVerAlumnosCursoCSV() {
    if (!verAlumnosCursoState) return;
    const csvBtn = document.getElementById('vac-csv');
    if (csvBtn) csvBtn.disabled = true;
    try {
        const anio = parseInt(document.getElementById('vac-anio')?.value) || verAlumnosCursoState.anio;
        const periodo = document.getElementById('vac-periodo')?.value || '';
        const all = [];
        let page = 1;
        let totalPages = 1;
        do {
            let url = `/api/cursos/${verAlumnosCursoState.cursoId}/alumnos?anio_lectivo=${anio}&page=${page}&limit=200`;
            if (periodo) url += `&periodo=${periodo}`;
            const data = await apiFetch(url);
            all.push(...(data.alumnos || []));
            totalPages = data.totalPages || 1;
            page++;
        } while (page <= totalPages);

        if (all.length === 0) {
            Swal.fire('Sin datos', 'No hay alumnos para exportar', 'info');
            return;
        }
        const enc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        let csv = '\uFEFFApellido,Nombre,DNI,Teléfono,Email,Estado,Período,Fecha Inscripción\n';
        all.forEach(a => {
            csv += [enc(a.apellido), enc(a.nombre), enc(a.dni), enc(a.telefono), enc(a.email), enc(a.estado), a.periodo ? 'Sem ' + a.periodo : '-', enc(a.fecha_inscripcion ? formatDate(a.fecha_inscripcion) : '')].join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `alumnos-curso-${verAlumnosCursoState.cursoId}-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    } catch (e) {
        Swal.fire('Error', e.message, 'error');
    } finally {
        if (csvBtn) csvBtn.disabled = false;
    }
}

// ==================== CUOTAS ====================
let cuotasCursoActual = null;

function showCuotasCurso(cursoId, cursoNombre, anio) {
    cuotasCursoActual = { id: cursoId, nombre: cursoNombre, anio };
    $('cuota-curso-info').textContent = `${cursoNombre} (${anio})`;
    $('cuotas-section').style.display = '';
    loadCuotas(cursoId, anio);
}

function closeCuotasSection() {
    $('cuotas-section').style.display = 'none';
    cuotasCursoActual = null;
}

async function loadCuotas(cursoId, anio) {
    try {
        const data = await apiFetch(`/api/cursos/${cursoId}/cuotas?anio_lectivo=${anio}`);
        const tbody = $('cuotas-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.cuotas || []).forEach((c, i) => {
            tbody.innerHTML += `<tr>
                <td>${c.orden || i + 1}</td>
                <td>${esc(c.nombre || '-')}</td>
                <td>${c.periodo ? 'Sem ' + c.periodo : 'Anual'}</td>
                <td>${formatDate(c.fecha_vencimiento)}</td>
                <td>${formatMoney(c.monto || 0)}</td>
                <td>${esc(c.recargo_mora || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deleteCuota(${esc(c.id)}, ${cursoId})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function deleteCuota(cuotaId, cursoId) {
    const r = await Swal.fire({ title: 'Eliminar cuota?', icon: 'question', showCancelButton: true });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/cursos/cuotas/${cuotaId}`, { method: 'DELETE' });
        Swal.fire('Eliminada', '', 'success');
        if (cuotasCursoActual) loadCuotas(cuotasCursoActual.id, cuotasCursoActual.anio);
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function generarCuotasAuto() {
    if (!cuotasCursoActual) return;
    const curso = (await apiFetch(`/api/cursos/${esc(cuotasCursoActual.id)}`).catch(() => null))?.curso || null;
    const esSemestral = curso?.tipo_periodo === 'SEMESTRAL';
    const r = await Swal.fire({
        title: `Generar cuotas para ${esc(cuotasCursoActual.nombre)}?`,
        text: `Se crearán 12 cuotas para el año ${esc(cuotasCursoActual.anio)}${esSemestral ? ' (Matrícula + Ene-Jun: 1er semestre, Jul-Dic: 2do semestre)' : ''}`,
        icon: 'question', showCancelButton: true, confirmButtonText: 'Generar'
    });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/cursos/${esc(cuotasCursoActual.id)}/cuotas/generar`, {
            method: 'POST', body: JSON.stringify({ anio_lectivo: cuotasCursoActual.anio })
        });
        Swal.fire('Éxito', 'Cuotas generadas correctamente', 'success');
        loadCuotas(cuotasCursoActual.id, cuotasCursoActual.anio);
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function addCuotaManual() {
    if (!cuotasCursoActual) return;
    const curso = (await apiFetch(`/api/cursos/${esc(cuotasCursoActual.id)}`).catch(() => null))?.curso || null;
    const esSemestral = curso?.tipo_periodo === 'SEMESTRAL';
    const { value } = await Swal.fire({
        title: 'Agregar cuota manual',
        html:
            '<input id="swal-nombre" class="swal2-input" placeholder="Nombre (ej: Marzo)">' +
            '<input id="swal-monto" class="swal2-input" type="number" placeholder="Monto (Gs.)">' +
            '<input id="swal-fecha" class="swal2-input" type="date">' +
            '<input id="swal-orden" class="swal2-input" type="number" placeholder="Orden (1,2,3...)" value="13">' +
            (esSemestral
                ? '<select id="swal-periodo" class="swal2-select"><option value="1">1er Semestre</option><option value="2">2do Semestre</option></select>'
                : '<input type="hidden" id="swal-periodo" value="1">'),
        focusConfirm: false,
        preConfirm: () => ({
            nombre: document.getElementById('swal-nombre').value.trim(),
            monto: parseInt(document.getElementById('swal-monto').value) || 0,
            fecha_vencimiento: document.getElementById('swal-fecha').value || null,
            orden: parseInt(document.getElementById('swal-orden').value) || 13,
            periodo: parseInt(document.getElementById('swal-periodo').value) || 1
        })
    });
    if (!value || !value.nombre) return;
    try {
        await apiFetch(`/api/cursos/${esc(cuotasCursoActual.id)}/cuotas`, {
            method: 'POST', body: JSON.stringify({ ...value, anio_lectivo: cuotasCursoActual.anio })
        });
        Swal.fire('Éxito', 'Cuota agregada', 'success');
        loadCuotas(cuotasCursoActual.id, cuotasCursoActual.anio);
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== HISTORIAL DE COSTOS ====================
async function verHistorialCurso(cursoId, cursoNombre) {
    try {
        const data = await apiFetch(`/api/cursos/${cursoId}/historial`);
        const historial = data.historial || [];
        if (historial.length === 0) {
            return Swal.fire('Sin historial', `${cursoNombre} no tiene cambios registrados en sus costos`, 'info');
        }
        let html = `<div class="table-responsive" style="max-height:400px;overflow-y:auto;">
            <table class="table table-sm table-bordered">
                <thead class="table-light"><tr>
                    <th>Fecha</th><th>Usuario</th><th>Resolución</th><th>Matrícula</th><th>Parcial</th><th>Compl</th><th>Extra</th><th>Doc.</th>
                </tr></thead><tbody>`;
        historial.forEach(h => {
            const f = new Date(h.modified_at).toLocaleDateString('es-PY');
            const u = esc(h.modified_by || '-');
            const r = esc(h.numero_resolucion || '-');
            const d = h.documento_expedido ? `${docLabel(h.documento_expedido)}: ${formatMoney(h.documento_monto)}` : '-';
            html += `<tr><td>${f}</td><td>${u}</td><td>${r}</td>
                <td>${formatMoney(h.matricula_monto)}</td>
                <td>${formatMoney(h.examen_parcial_monto)}</td>
                <td>${formatMoney(h.examen_complementario_monto)}</td>
                <td>${formatMoney(h.extra_ordinario_monto)}</td>
                <td>${d}</td></tr>`;
        });
        html += '</tbody></table></div>';
        Swal.fire({ title: `Historial - ${esc(cursoNombre)}`, html, width: 800 });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== COBROS ====================
async function searchCobroAlumno() {
    const q = $('cobro-alumno-search')?.value?.trim();
    if (!q || q.length < 2) return;
    try {
        const data = await apiFetch(`/api/alumnos?search=${encodeURIComponent(q)}&limit=10`);
        const alumnos = data.rows || [];
        if (alumnos.length === 0) return Swal.fire('Sin resultados', 'No se encontraron alumnos', 'info');
        if (alumnos.length === 1) {
            selectCobroAlumno(alumnos[0]);
        } else {
            const inputOptions = {};
            alumnos.forEach(a => { inputOptions[a.id] = `${esc(a.nombre)} ${esc(a.apellido || '')} - DNI: ${esc(a.dni || '')}`; });
            const { value } = await Swal.fire({
                title: 'Seleccionar Alumno',
                input: 'select',
                inputOptions,
                showCancelButton: true,
                inputPlaceholder: 'Seleccionar...'
            });
            if (value) {
                const alumno = alumnos.find(a => a.id === parseInt(value));
                if (alumno) selectCobroAlumno(alumno);
            }
        }
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function selectCobroAlumno(alumno) {
    selectedCobroAlumno = alumno;
    $('cobro-alumno-selected').style.display = '';
    $('cobro-alumno-nombre').textContent = `${esc(alumno.nombre)} ${esc(alumno.apellido || '')}`;
    $('cobro-alumno-dni').textContent = `DNI: ${esc(alumno.dni || '')}`;
    loadDeudaAlumno(alumno.id);
    loadCobroResponsables(alumno.id);
}

function clearCobroAlumno() {
    selectedCobroAlumno = null;
    $('cobro-alumno-selected').style.display = 'none';
    $('cobro-deuda-body').innerHTML = '';
    $('cobro-total-pendiente').textContent = formatMoney(0);
    $('cobro-total-mora').textContent = formatMoney(0);
    $('form-cobro')?.reset();
    $('cobro-cuota-id').value = '';
    $('cobro-monto-info').style.display = 'none';
    $('cobro-deuda-table').style.display = '';
}

async function loadDeudaAlumno(alumnoId) {
    try {
        const data = await apiFetch(`/api/alumnos/${alumnoId}/deuda/${currentAnioLectivo}`);
        const tbody = $('cobro-deuda-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        $('cobro-deuda-table').style.display = 'none';
        let totalPendiente = 0;
        let totalMora = 0;
        (data.deuda || []).forEach(c => {
            const monto = c.monto || 0;
            const mora = c.recargo_mora || 0;
            const total = monto + mora;
            totalPendiente += monto;
            totalMora += mora;
            tbody.innerHTML += `<tr>
                <td>${esc(c.curso_nombre || '')}</td>
                <td>${c.cuota_nombre || c.nombre || c.concepto || '-'}</td>
                <td>${formatDate(c.fecha_vencimiento)}</td>
                <td>${formatMoney(monto)}</td>
                <td>${formatMoney(mora)}</td>
                <td>${formatMoney(total)}</td>
                <td><input type="radio" name="cuota-select" value="${c.cuota_id || c.id}" data-monto="${total}" data-nombre="${c.cuota_nombre || c.nombre || c.concepto || ''}" data-curso="${esc(c.curso_nombre || '')}" onchange="onCuotaSelect(this)"></td>
            </tr>`;
        });
        $('cobro-total-pendiente').textContent = formatMoney(totalPendiente);
        $('cobro-total-mora').textContent = formatMoney(totalMora);
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function onCuotaSelect(radio) {
    selectedCuotaId = radio.value;
    const monto = parseInt(radio.dataset.monto) || 0;
    const nombre = radio.dataset.nombre || '';
    const curso = radio.dataset.curso || '';
    $('cobro-monto').value = monto;
    $('cobro-monto-info').style.display = '';
    $('cobro-monto-info').textContent = `Cuota: ${nombre} (${curso}) - Total: ${formatMoney(monto)}`;
}

async function loadCobrosResponsables(alumnoId) {
    try {
        const data = await apiFetch(`/api/alumnos/${alumnoId}/responsables`);
        const select = $('cobro-responsable-id');
        select.innerHTML = '<option value="">Seleccionar responsable...</option>';
        (data.responsables || []).forEach(r => {
            select.innerHTML += `<option value="${esc(r.id)}">${esc(r.nombre)} ${esc(r.apellido || '')} - ${esc(r.dni || '')}</option>`;
        });
    } catch (e) { console.error(e); }
}

async function loadCobrosRecientes() {
    try {
        const data = await apiFetch('/api/pagos?page=1&limit=20');
        const tbody = $('cobros-recientes-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.pagos || data.rows || []).forEach(p => {
            tbody.innerHTML += `<tr>
                <td>${formatDate(p.fecha_pago)}</td>
                <td>${esc(p.alumno_nombre) || esc(p.alumno?.nombre) || '-'}</td>
                <td>${formatMoney(p.monto)}</td>
            </tr>`;
        });
    } catch (e) { console.error(e); }
}

function openPagoModal() {
    if (!selectedCobroAlumno) return Swal.fire('Error', 'Seleccione un alumno', 'warning');
    const monto = parseInt($('cobro-monto')?.value) || 0;
    if (!monto || monto <= 0) return Swal.fire('Error', 'Ingrese un monto valido', 'warning');

    const cuotaRadio = document.querySelector('input[name="cuota-select"]:checked');
    const concepto = cuotaRadio ? `${cuotaRadio.dataset.nombre} (${cuotaRadio.dataset.curso})` : ($('cobro-observaciones')?.value || 'Pago general');

    $('pago-modal-total').textContent = formatMoney(monto);
    $('pago-modal-alumno').value = `${esc(selectedCobroAlumno.nombre)} ${esc(selectedCobroAlumno.apellido || '')}`;
    $('pago-modal-cuota').value = concepto;
    $('pago-modal-metodo').value = 'Efectivo';
    $('pago-modal-comprobante').value = '';
    $('pago-modal-observaciones').value = '';

    pendingPagoData = {
        alumno_id: selectedCobroAlumno.id,
        matricula_id: null,
        cuota_id: cuotaRadio ? parseInt(cuotaRadio.value) : null,
        responsable_id: $('cobro-responsable-id')?.value ? parseInt($('cobro-responsable-id').value) : null,
        monto: monto,
        concepto: concepto,
        metodo_pago: 'Efectivo',
        comprobante: '',
        observaciones: ''
    };

    pagoModal?.show();
}

async function confirmarPagoModal() {
    if (!pendingPagoData) return;
    pendingPagoData.metodo_pago = $('pago-modal-metodo')?.value || 'Efectivo';
    pendingPagoData.comprobante = $('pago-modal-comprobante')?.value?.trim() || '';
    pendingPagoData.observaciones = $('pago-modal-observaciones')?.value?.trim() || '';
    try {
        await apiFetch('/api/pagos', { method: 'POST', body: JSON.stringify(pendingPagoData) });
        pagoModal?.hide();
        pendingPagoData = null;
        Swal.fire('Exito', 'Pago registrado', 'success');
        if (selectedCobroAlumno) loadDeudaAlumno(selectedCobroAlumno.id);
        loadCobrosRecientes();
        loadDashboard();
        $('form-cobro')?.reset();
        $('cobro-cuota-id').value = '';
        $('cobro-monto-info').style.display = 'none';
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function resetCobroForm() {
    clearCobroAlumno();
}

// ==================== RESPONSABLES ====================
async function loadResponsables(search = '') {
    try {
        const data = await apiFetch(`/api/responsables?search=${encodeURIComponent(search)}`);
        const tbody = $('responsables-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.responsables || []).forEach(r => {
            tbody.innerHTML += `<tr>
                <td>${esc(r.id)}</td>
                <td>${esc(r.nombre || '')}</td>
                <td>${esc(r.apellido || '')}</td>
                <td>${esc(r.dni || '')}</td>
                <td>${esc(r.email || '')}</td>
                <td>${esc(r.telefono || '')}</td>
                <td>${esc(r.telefono_alt || '')}</td>
                <td>${esc(r.direccion || '')}</td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editResponsable(${esc(r.id)})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteResponsable(${esc(r.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function editResponsable(id) {
    try {
        const data = await apiFetch(`/api/responsables/${id}`);
        const r = data.responsable || data;
        $('edit-responsable-id').value = r.id;
        $('resp-nombre').value = r.nombre || '';
        $('resp-apellido').value = r.apellido || '';
        $('resp-dni').value = r.dni || '';
        $('resp-email').value = r.email || '';
        $('resp-telefono').value = r.telefono || '';
        $('resp-telefono-alt').value = r.telefono_alt || '';
        $('resp-direccion').value = r.direccion || '';
        $('responsable-form-title').textContent = 'Editar Responsable';
        $('btn-cancel-edit-responsable').style.display = '';
        $('btn-save-responsable').textContent = 'Actualizar Responsable';
        const collapse = bootstrap.Collapse.getOrCreateInstance($('responsableFormCollapse'));
        collapse.show();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function deleteResponsable(id) {
    const r = await Swal.fire({ title: 'Eliminar responsable?', icon: 'question', showCancelButton: true, confirmButtonText: 'Si, eliminar' });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/responsables/${id}`, { method: 'DELETE' });
        Swal.fire('Eliminado', '', 'success');
        loadResponsables();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function resetResponsableForm() {
    $('form-responsable')?.reset();
    $('edit-responsable-id').value = '';
    $('responsable-form-title').textContent = 'Registrar Nuevo Responsable';
    $('btn-cancel-edit-responsable').style.display = 'none';
    $('btn-save-responsable').textContent = 'Guardar Responsable';
}

// ==================== MATRICULAS ====================
async function loadMatriculas() {
    try {
        const data = await apiFetch(`/api/matriculas?anio_lectivo=${currentAnioLectivo}`);
        const tbody = $('matriculas-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.matriculas || []).forEach(m => {
            tbody.innerHTML += `<tr>
                <td>${esc(m.id)}</td>
                <td>${m.alumno_nombre || m.alumno?.nombre || ''} ${m.alumno_apellido || m.alumno?.apellido || ''}</td>
                <td>${m.curso_nombre || m.curso?.nombre || ''}</td>
                <td>${m.nivel || m.curso?.nivel || ''}</td>
                <td>${esc(m.anio_lectivo)}</td>
                <td>${m.tipo_periodo === 'SEMESTRAL' ? 'Sem ' + (m.periodo || 1) : 'Anual'}</td>
                <td>${formatDate(m.fecha_matricula || m.created_at)}</td>
                <td><button class="btn btn-sm btn-danger" onclick="bajaMatricula(${esc(m.id)})"><i class="bi bi-x-circle"></i> Baja</button></td>
            </tr>`;
        });
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function loadMatriculasCursosDropdown() {
    try {
        const data = await apiFetch(`/api/cursos?anio_lectivo=${currentAnioLectivo}`);
        const select = $('mat-curso-id');
        if (!select) return;
        select.innerHTML = '<option value="">Seleccionar curso...</option>';
        (data.cursos || []).forEach(c => {
            select.innerHTML += `<option value="${esc(c.id)}" data-tipo-periodo="${c.tipo_periodo || 'ANUAL'}">${esc(c.nombre)} - ${esc(c.nivel || '')} ${esc(c.turno || '')}</option>`;
        });
    } catch (e) { console.error(e); }
}

function togglePeriodoSelectMat() {
    const select = $('mat-curso-id');
    const col = $('mat-periodo-col');
    if (!select || !col) return;
    const opt = select.options[select.selectedIndex];
    const esSemestral = opt?.dataset?.tipoPeriodo === 'SEMESTRAL';
    col.style.display = esSemestral ? '' : 'none';
    if (!esSemestral) $('mat-periodo').value = '1';
}

async function searchMatAlumno() {
    const q = $('mat-alumno-search')?.value?.trim();
    if (!q || q.length < 2) return;
    try {
        const data = await apiFetch(`/api/alumnos?search=${encodeURIComponent(q)}&limit=10`);
        const alumnos = data.rows || [];
        if (alumnos.length === 0) return Swal.fire('Sin resultados', 'No se encontraron alumnos', 'info');
        if (alumnos.length === 1) {
            $('mat-alumno-selected').value = `${alumnos[0].nombre} ${alumnos[0].apellido || ''}`;
            $('mat-alumno-id').value = alumnos[0].id;
        } else {
            const inputOptions = {};
            alumnos.forEach(a => { inputOptions[a.id] = `${esc(a.nombre)} ${esc(a.apellido || '')} - DNI: ${esc(a.dni || '')}`; });
            const { value } = await Swal.fire({
                title: 'Seleccionar Alumno',
                input: 'select',
                inputOptions,
                showCancelButton: true,
                inputPlaceholder: 'Seleccionar...'
            });
            if (value) {
                const alumno = alumnos.find(a => a.id === parseInt(value));
                if (alumno) {
                    $('mat-alumno-selected').value = `${esc(alumno.nombre)} ${esc(alumno.apellido || '')}`;
                    $('mat-alumno-id').value = alumno.id;
                }
            }
        }
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function bajaMatricula(id) {
    const r = await Swal.fire({ title: 'Dar de baja matricula?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Si, dar de baja' });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/matriculas/${id}/baja`, { method: 'PUT' });
        Swal.fire('Dada de baja', '', 'success');
        loadMatriculas();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function resetMatriculaForm() {
    $('form-matricula')?.reset();
    $('mat-alumno-id').value = '';
    $('mat-alumno-selected').value = '';
    const col = $('mat-periodo-col');
    if (col) col.style.display = 'none';
}

// ==================== MOROSIDAD ====================
async function loadMorosidadFiltros() {
    try {
        const data = await apiFetch(`/api/cursos?anio_lectivo=${currentAnioLectivo}`);
        const select = $('morosidad-curso-filter');
        if (!select) return;
        select.innerHTML = '<option value="">Todos los cursos</option>';
        (data.cursos || []).forEach(c => {
            select.innerHTML += `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`;
        });
    } catch (e) { console.error(e); }
}

async function loadMorosidad() {
    const search = $('morosidad-search')?.value?.trim() || '';
    const cursoFilter = $('morosidad-curso-filter')?.value || '';
    try {
        let url = `/api/reportes/deudores?anio_lectivo=${currentAnioLectivo}`;
        if (cursoFilter) url += `&curso_id=${cursoFilter}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        const data = await apiFetch(url);
        const deudores = data.deudores || [];
        const tbody = $('morosidad-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        let totalDeudores = deudores.length;
        let totalDeuda = 0;
        let totalMora = 0;
        let totalDias = 0;

        deudores.forEach(d => {
            const deudaBase = d.deuda_total || 0;
            const mora = d.mora_total || 0;
            const dias = d.dias_atraso || 0;
            totalDeuda += deudaBase;
            totalMora += mora;
            totalDias += dias;
            tbody.innerHTML += `<tr>
                <td>${esc(d.nombre || '')} ${esc(d.apellido || '')}</td>
                <td>${esc(d.dni || '')}</td>
                <td>${esc(d.curso || '')}</td>
                <td>${esc(d.cuota_nombre || '')}</td>
                <td>${formatDate(d.fecha_vencimiento)}</td>
                <td>${dias}</td>
                <td>${formatMoney(deudaBase)}</td>
                <td>${formatMoney(mora)}</td>
                <td>${formatMoney(deudaBase + mora)}</td>
                <td><button class="btn btn-sm btn-outline-success" onclick="showSection('cobros')"><i class="bi bi-cash"></i></button></td>
            </tr>`;
        });

        $('moro-deudores-count').textContent = totalDeudores;
        $('moro-deuda-total').textContent = formatMoney(totalDeuda);
        $('moro-mora-total').textContent = formatMoney(totalMora);
        $('moro-dias-prom').textContent = totalDeudores > 0 ? Math.round(totalDias / totalDeudores) : 0;
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== REPORTES ====================
async function loadReportes() {
    const fechaFrom = $('reporte-fecha-from')?.value || '';
    const fechaTo = $('reporte-fecha-to')?.value || '';
    try {
        let url = '/api/reportes/cobros?';
        if (fechaFrom) url += `fecha_from=${fechaFrom}&`;
        if (fechaTo) url += `fecha_to=${fechaTo}`;
        const data = await apiFetch(url);

        $('repo-total-cobrado').textContent = formatMoney(data.totalCobrado || 0);
        $('repo-cant-pagos').textContent = data.cantidadPagos || 0;
        $('repo-promedio').textContent = formatMoney(data.promedioPago || 0);
        $('repo-efec-digital').textContent = `${esc(data.efectivo || 0)} / ${esc(data.digital || 0)}`;

        const tbodyDia = $('reporte-por-dia-body');
        if (tbodyDia) {
            tbodyDia.innerHTML = '';
            (data.porDia || []).forEach(d => {
                tbodyDia.innerHTML += `<tr>
                    <td>${formatDate(d.fecha)}</td>
                    <td>${esc(d.cantidad || 0)}</td>
                    <td>${formatMoney(d.efectivo || 0)}</td>
                    <td>${formatMoney(d.digital || 0)}</td>
                    <td>${formatMoney(d.total || 0)}</td>
                </tr>`;
            });
        }

        const tbodyCobros = $('reporte-cobros-body');
        if (tbodyCobros) {
            tbodyCobros.innerHTML = '';
            (data.detalle || data.cobros || []).forEach(c => {
                tbodyCobros.innerHTML += `<tr>
                    <td>${formatDate(c.fecha_pago)}</td>
                    <td>${esc(c.alumno_nombre || '')} ${esc(c.alumno_apellido || '')}</td>
                    <td>${esc(c.curso_nombre || '')}</td>
                    <td>${c.cuota_nombre || c.concepto || ''}</td>
                    <td>${formatMoney(c.monto)}</td>
                    <td>${esc(c.metodo_pago || '')}</td>
                    <td>${esc(c.responsable_nombre || '')} ${esc(c.responsable_apellido || '')}</td>
                    <td>${esc(c.user_name || '')}</td>
                </tr>`;
            });
        }
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== CAJA ====================
async function checkCajaStatus() {
    try {
        const data = await apiFetch('/api/register/status');
        const session = data.session || {};
        if (session.status === 'OPEN') {
            $('caja-view-open').style.display = 'none';
            $('caja-view-active').style.display = '';
            loadCajaCloseData();
        } else {
            $('caja-view-open').style.display = '';
            $('caja-view-active').style.display = 'none';
        }
    } catch (e) {
        $('caja-view-open').style.display = '';
        $('caja-view-active').style.display = 'none';
    }
}

async function openRegister() {
    const amountStr = $('caja-initial-amount')?.value?.trim();
    const amount = parseInt(amountStr) || 0;
    if (amount < 0) return Swal.fire('Error', 'Ingrese un monto valido', 'warning');
    try {
        await apiFetch('/api/register/open', { method: 'POST', body: JSON.stringify({ amount }) });
        Swal.fire('Caja abierta', 'Sesion iniciada correctamente', 'success');
        $('caja-initial-amount').value = '';
        checkCajaStatus();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function loadCajaCloseData() {
    try {
        const stats = await apiFetch(`/api/reportes/estadisticas?anio_lectivo=${currentAnioLectivo}`);
        $('close-expected-cash').textContent = formatMoney(stats.cajaEfectivoEsperado || 0);
        $('close-expected-digital').textContent = formatMoney(stats.cajaDigitalEsperado || 0);
        $('close-expected-total').textContent = formatMoney((stats.cajaEfectivoEsperado || 0) + (stats.cajaDigitalEsperado || 0));
    } catch (e) { console.error(e); }
    updateCajaDiff();
}

function updateCajaDiff() {
    const finalStr = $('caja-final-amount')?.value?.trim();
    const finalCash = parseInt(finalStr) || 0;
    const expectedText = $('close-expected-cash')?.textContent?.replace(/[^0-9.-]/g, '') || '0';
    const expected = parseInt(expectedText) || 0;
    const diff = finalCash - expected;
    const diffEl = $('close-diff-display');
    if (diffEl) {
        if (finalStr) {
            diffEl.textContent = `${diff >= 0 ? 'Sobrante' : 'Faltante'}: ${formatMoney(Math.abs(diff))}`;
            diffEl.className = `form-control form-control-lg fw-bold border-0 ${diff >= 0 ? 'bg-success text-white' : 'bg-danger text-white'}`;
        } else {
            diffEl.textContent = '-';
            diffEl.className = 'form-control form-control-lg bg-light border-0 fw-bold';
        }
    }
}

async function closeRegister() {
    const finalStr = $('caja-final-amount')?.value?.trim();
    const finalCash = parseInt(finalStr) || 0;
    const r = await Swal.fire({
        title: 'Cerrar Caja?',
        text: 'Se cerrara la sesion de caja actual.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Si, cerrar'
    });
    if (!r.isConfirmed) return;
    try {
        await apiFetch('/api/register/close', { method: 'POST', body: JSON.stringify({ finalCash }) });
        Swal.fire('Caja cerrada', 'Sesion finalizada', 'success');
        $('caja-final-amount').value = '';
        $('close-notes').value = '';
        checkCajaStatus();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== USERS ====================
async function loadUsers() {
    try {
        const [usersData, rolesData] = await Promise.all([
            apiFetch('/api/users'),
            apiFetch('/api/users/roles')
        ]);
        const users = usersData.users || [];
        const roles = rolesData.roles || [];
        const tbody = $('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const roleMap = {};
        roles.forEach(r => { roleMap[r.id] = r.name || r.nombre || ''; });

        users.forEach(u => {
            const roleName = roleMap[u.role_id] || u.role_name || '';
            const statusBadge = u.status ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-secondary">Inactivo</span>';
            const created = u.created_at ? formatDate(u.created_at) : '-';
            tbody.innerHTML += `<tr>
                <td>${esc(u.id)}</td>
                <td>${esc(u.username || '')}</td>
                <td>${roleName}</td>
                <td>${statusBadge}</td>
                <td>${created}</td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="editUser(${esc(u.id)})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${esc(u.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });

        const roleSelect = $('user-role');
        if (roleSelect) {
            roleSelect.innerHTML = '<option value="">Seleccionar rol...</option>';
            roles.forEach(r => {
                roleSelect.innerHTML += `<option value="${esc(r.id)}">${r.name || r.nombre || ''}</option>`;
            });
        }
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function editUser(id) {
    try {
        const data = await apiFetch('/api/users');
        const users = data.users || [];
        const u = users.find(x => x.id === id);
        if (!u) return;
        $('edit-user-id').value = u.id;
        $('user-username').value = u.username || '';
        $('user-password').value = '';
        $('user-password').placeholder = 'Dejar vacio para mantener';
        $('user-role').value = u.role_id || '';
        $('user-status').value = u.status ? 'true' : 'false';
        $('user-form-title').textContent = 'Editar Usuario';
        $('btn-save-user').textContent = 'Actualizar Usuario';
        const collapse = bootstrap.Collapse.getOrCreateInstance($('newUserForm'));
        collapse.show();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function deleteUser(id) {
    const r = await Swal.fire({ title: 'Eliminar usuario?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Si, eliminar' });
    if (!r.isConfirmed) return;
    try {
        await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
        Swal.fire('Eliminado', '', 'success');
        loadUsers();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

function resetUserForm() {
    $('user-form')?.reset();
    $('edit-user-id').value = '';
    $('user-form-title').textContent = 'Registrar Nuevo Usuario';
    $('btn-save-user').textContent = 'Guardar Usuario';
    $('user-password').placeholder = 'Contrasena (dejar vacio para mantener)';
}

// ==================== ROLES & PERMISSIONS ====================
async function initRolePermsTab() {
    try {
        const data = await apiFetch('/api/users/roles');
        const roles = data.roles || [];
        const select = $('perm-role-select');
        if (!select) return;
        select.innerHTML = '<option value="">Seleccionar rol...</option>';
        roles.forEach(r => {
            select.innerHTML += `<option value="${esc(r.id)}">${r.name || r.nombre || ''}</option>`;
        });
        $('permissions-grid-container').innerHTML = '<p class="text-muted">Seleccione un rol para ver sus permisos.</p>';
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function loadRolePermissionsGrid() {
    const roleId = $('perm-role-select')?.value;
    if (!roleId) {
        $('permissions-grid-container').innerHTML = '<p class="text-muted">Seleccione un rol para ver sus permisos.</p>';
        return;
    }
    try {
        const [allPermsData, rolePermsData] = await Promise.all([
            apiFetch('/api/users/permissions'),
            apiFetch(`/api/users/roles/${roleId}/permissions`)
        ]);
        const permissions = allPermsData.permissions || [];
        const assignedIds = new Set(rolePermsData.permissionIds || rolePermsData.permission_ids || []);

        const container = $('permissions-grid-container');
        if (!container) return;
        container.innerHTML = '';

        permissions.forEach(p => {
            const pId = p.id || p.permission_id;
            const pName = p.name || p.nombre || p.descripcion || `Permiso ${pId}`;
            const checked = assignedIds.has(pId) || assignedIds.has(String(pId)) ? 'checked' : '';
            container.innerHTML += `<div class="col-md-4">
                <div class="form-check form-switch">
                    <input class="form-check-input perm-check" type="checkbox" value="${pId}" id="perm-${pId}" ${checked}>
                    <label class="form-check-label" for="perm-${pId}">${pName}</label>
                </div>
            </div>`;
        });

        if (permissions.length === 0) {
            container.innerHTML = '<p class="text-muted">No hay permisos configurados.</p>';
        }
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

async function saveRolePermissions() {
    const roleId = $('perm-role-select')?.value;
    if (!roleId) return Swal.fire('Error', 'Seleccione un rol', 'warning');
    const ids = [...document.querySelectorAll('.perm-check:checked')].map(c => parseInt(c.value));
    try {
        await apiFetch(`/api/users/roles/${roleId}/permissions`, {
            method: 'PUT',
            body: JSON.stringify({ permissionIds: ids })
        });
        Swal.fire('Exito', 'Permisos actualizados', 'success');
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// ==================== PAGINATION HELPER ====================
function renderPagination(containerId, totalPages, currentPage, callback) {
    const el = $(containerId);
    if (!el || !totalPages || totalPages <= 1) { if (el) el.innerHTML = ''; return; }
    el.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-primary'} me-1 mb-1`;
        btn.textContent = i;
        btn.onclick = () => callback(i);
        el.appendChild(btn);
    }
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    pagoModal = new bootstrap.Modal($('pagoModal'));

    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('currency-input')) {
            formatCurrencyInput(e.target);
        }
    });

    $('login-form')?.addEventListener('submit', handleLogin);

    document.querySelector('.main-wrapper').style.display = 'none';

    if (authToken) {
        apiFetch('/api/auth/me').then(data => {
            currentUser = data.user;
            $('login-overlay').style.display = 'none';
            document.querySelector('.main-wrapper').style.display = 'flex';
            $('logged-username').textContent = currentUser?.username || '';
            $('logged-userrole').textContent = currentUser?.role_name || '';
            loadDashboard();
        }).catch(() => {
            authToken = null;
            localStorage.removeItem('authToken');
        });
    }

    $('form-alumno')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('edit-alumno-id')?.value;
        const body = {
            nombre: $('alumno-nombre')?.value?.trim() || '',
            apellido: $('alumno-apellido')?.value?.trim() || '',
            dni: $('alumno-dni')?.value?.trim() || '',
            fecha_nacimiento: $('alumno-nacimiento')?.value || null,
            email: $('alumno-email')?.value?.trim() || '',
            telefono: $('alumno-telefono')?.value?.trim() || '',
            direccion: $('alumno-direccion')?.value?.trim() || '',
            observaciones: $('alumno-observaciones')?.value?.trim() || '',
            estado: $('alumno-estado')?.value || 'activo'
        };
        if (!body.nombre) return Swal.fire('Error', 'Nombre requerido', 'warning');
        try {
            if (id) await apiFetch(`/api/alumnos/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            else await apiFetch('/api/alumnos', { method: 'POST', body: JSON.stringify(body) });
            Swal.fire('Exito', id ? 'Alumno actualizado' : 'Alumno creado', 'success');
            resetAlumnoForm();
            loadAlumnos();
            const collapse = bootstrap.Collapse.getOrCreateInstance($('alumnoFormCollapse'));
            collapse.hide();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });

    $('form-curso')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('edit-curso-id')?.value;
        const body = {
            nombre: $('curso-nombre')?.value?.trim() || '',
            nivel: $('curso-nivel')?.value || 'Primaria',
            turno: $('curso-turno')?.value || 'Manana',
            anio_lectivo: parseInt($('curso-anio')?.value) || currentAnioLectivo,
            dia_vencimiento: parseInt($('curso-dia-venc')?.value) || 10,
            activo: $('curso-activo')?.value === '1',
            tipo_periodo: $('curso-tipo-periodo')?.value || 'ANUAL',
            cuota_mensual: parseInt($('curso-cuota-mensual')?.value?.replace(/\./g, '')) || 0,
            recargo_mora_pct: parseFloat($('curso-mora-pct')?.value) || 0,
            numero_resolucion: $('curso-numero-resolucion')?.value?.trim() || '',
            matricula_mec: parseInt($('curso-matricula-mec')?.value?.replace(/\./g, '')) || 0,
            matricula_inst: parseInt($('curso-matricula-inst')?.value?.replace(/\./g, '')) || 0,
            examen_parcial_mec: parseInt($('curso-examen-parcial-mec')?.value?.replace(/\./g, '')) || 0,
            examen_parcial_inst: parseInt($('curso-examen-parcial-inst')?.value?.replace(/\./g, '')) || 0,
            examen_complementario_mec: parseInt($('curso-examen-complementario-mec')?.value?.replace(/\./g, '')) || 0,
            examen_complementario_inst: parseInt($('curso-examen-complementario-inst')?.value?.replace(/\./g, '')) || 0,
            extra_ordinario_mec: parseInt($('curso-extra-ordinario-mec')?.value?.replace(/\./g, '')) || 0,
            extra_ordinario_inst: parseInt($('curso-extra-ordinario-inst')?.value?.replace(/\./g, '')) || 0,
            documento_expedido: $('curso-documento-tipo')?.value || '',
            documento_mec: parseInt($('curso-documento-mec')?.value?.replace(/\./g, '')) || 0,
            documento_inst: parseInt($('curso-documento-inst')?.value?.replace(/\./g, '')) || 0
        };
        if (!body.nombre) return Swal.fire('Error', 'Nombre requerido', 'warning');
        try {
            if (id) await apiFetch(`/api/cursos/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            else await apiFetch('/api/cursos', { method: 'POST', body: JSON.stringify(body) });
            Swal.fire('Exito', id ? 'Curso actualizado' : 'Curso creado', 'success');
            resetCursoForm();
            loadCursos();
            const collapse = bootstrap.Collapse.getOrCreateInstance($('cursoFormCollapse'));
            collapse.hide();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });

    $('form-responsable')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('edit-responsable-id')?.value;
        const body = {
            nombre: $('resp-nombre')?.value?.trim() || '',
            apellido: $('resp-apellido')?.value?.trim() || '',
            dni: $('resp-dni')?.value?.trim() || '',
            email: $('resp-email')?.value?.trim() || '',
            telefono: $('resp-telefono')?.value?.trim() || '',
            telefono_alt: $('resp-telefono-alt')?.value?.trim() || '',
            direccion: $('resp-direccion')?.value?.trim() || ''
        };
        if (!body.nombre) return Swal.fire('Error', 'Nombre requerido', 'warning');
        try {
            if (id) await apiFetch(`/api/responsables/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            else await apiFetch('/api/responsables', { method: 'POST', body: JSON.stringify(body) });
            Swal.fire('Exito', id ? 'Responsable actualizado' : 'Responsable creado', 'success');
            resetResponsableForm();
            loadResponsables();
            const collapse = bootstrap.Collapse.getOrCreateInstance($('responsableFormCollapse'));
            collapse.hide();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });

    $('form-matricula')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alumnoId = $('mat-alumno-id')?.value;
        const cursoId = $('mat-curso-id')?.value;
        const anio = $('mat-anio')?.value;
        const opt = document.querySelector(`#mat-curso-id option[value="${cursoId}"]`);
        const esSemestral = opt?.dataset?.tipoPeriodo === 'SEMESTRAL';
        const periodo = esSemestral ? (parseInt($('mat-periodo')?.value) || 1) : 1;
        if (!alumnoId) return Swal.fire('Error', 'Seleccione un alumno', 'warning');
        if (!cursoId) return Swal.fire('Error', 'Seleccione un curso', 'warning');
        if (!anio) return Swal.fire('Error', 'Ingrese el ano lectivo', 'warning');
        try {
            await apiFetch('/api/matriculas', {
                method: 'POST',
                body: JSON.stringify({ alumno_id: parseInt(alumnoId), curso_id: parseInt(cursoId), anio_lectivo: parseInt(anio), periodo })
            });
            Swal.fire('Exito', 'Matricula registrada', 'success');
            resetMatriculaForm();
            loadMatriculas();
            const collapse = bootstrap.Collapse.getOrCreateInstance($('matriculaFormCollapse'));
            collapse.hide();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });

    $('form-cobro')?.addEventListener('submit', (e) => {
        e.preventDefault();
        openPagoModal();
    });

    $('btn-confirmar-pago-modal')?.addEventListener('click', confirmarPagoModal);

    $('user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = $('edit-user-id')?.value;
        const body = {
            username: $('user-username')?.value?.trim() || '',
            role_id: parseInt($('user-role')?.value) || null,
            status: $('user-status')?.value === 'true'
        };
        const password = $('user-password')?.value;
        if (!body.username) return Swal.fire('Error', 'Nombre de usuario requerido', 'warning');
        if (!id && !password) return Swal.fire('Error', 'Contrasena requerida', 'warning');
        if (password) body.password = password;
        try {
            if (id) await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            else await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(body) });
            Swal.fire('Exito', id ? 'Usuario actualizado' : 'Usuario creado', 'success');
            resetUserForm();
            loadUsers();
            const collapse = bootstrap.Collapse.getOrCreateInstance($('newUserForm'));
            collapse.hide();
        } catch (e) { Swal.fire('Error', e.message, 'error'); }
    });

    $('role-perms-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveRolePermissions();
    });

    $('alumno-search')?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => loadAlumnos(e.target.value), 300);
    });

    $('responsable-search')?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => loadResponsables(e.target.value), 300);
    });

    $('caja-final-amount')?.addEventListener('input', updateCajaDiff);

    $('apc-periodo')?.addEventListener('change', loadAlumnosPorCurso);
    $('apc-anio')?.addEventListener('change', () => {
        loadAlumnosPorCursoDropdown();
        togglePeriodoFilterAPC();
        loadAlumnosPorCurso();
    });
});
