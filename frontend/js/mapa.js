// Módulo do Mapa (mapa.html)
//
//  Firebase Realtime DB → escuta doações em tempo real
//  Leaflet.js → renderiza o mapa interativo
//  Sidebar    → lista de doações com filtro e busca
'use strict';

const MapaPage = (() => {
  let _map        = null;
  let _markers    = {};    // { id: L.marker }
  let _doacoes    = {};    // cache: { id: doacao }
  let _filtroTipo = 'todos';
  let _buscaCidade = '';
  let _selecionado = null;

  // ── Cores por tipo 
  const CORES = {
    refeicao_pronta:        '#2D6A4F',
    alimento_nao_perecivel: '#40916C',
    fruta_legume:           '#F4A261',
    padaria:                '#E76F51',
    outro:                  '#78716C',
  };
  const EMOJIS = {
    refeicao_pronta:'🍽', alimento_nao_perecivel:'📦',
    fruta_legume:'🥦', padaria:'🥖', outro:'📋',
  };

  // ── Ícone do marcador 
  const criarIcone = (tipo, destaque = false) => L.divIcon({
    className: '',
    html: `<div style="
      width:${destaque?44:36}px; height:${destaque?44:36}px;
      background:${CORES[tipo]||CORES.outro};
      border:${destaque?3:2.5}px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 ${destaque?6:3}px ${destaque?16:10}px rgba(0,0,0,${destaque?.35:.25});
      transition:all .2s ease;
    ">
      <div style="transform:rotate(45deg);text-align:center;
        line-height:${destaque?38:30}px;font-size:${destaque?16:13}px">
        ${EMOJIS[tipo]||'📋'}
      </div>
    </div>`,
    iconSize:    [destaque?44:36, destaque?44:36],
    iconAnchor:  [destaque?22:18, destaque?44:36],
    popupAnchor: [0, -40],
  });

  // ── Inicializa o mapa 
  const init = () => {
    const mapEl = document.getElementById('map');
    if (!mapEl || _map) return;

    _map = L.map('map', {
      center: [-8.0476, -34.877],
      zoom: 13,
      zoomControl: false,
    });

    // Controles de zoom no canto superior esquerdo
    L.control.zoom({ position: 'topleft' }).addTo(_map);

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    // Geolocalização do usuário
    _geoLocalizarUsuario();

    // Carrega doações iniciais
    _carregarDoacoes();

    // Firebase Realtime DB (tempo real)
    document.addEventListener('firebaseReady', _iniciarRealtime);

    // Fechar painel ao clicar no mapa
    _map.on('click', () => fecharDetalhe());
  };

  // ── Geolocalização 
  const _geoLocalizarUsuario = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        _map.setView([coords.latitude, coords.longitude], 14);
        L.circleMarker([coords.latitude, coords.longitude], {
          radius: 9, fillColor: '#3B82F6', color: 'white',
          weight: 2.5, fillOpacity: 0.9,
        }).addTo(_map).bindTooltip('Você está aqui', { permanent: false });
      },
      () => {},
      { timeout: 6000 }
    );
  };

  // ── Carrega doações via API REST ─────────────────────────
  const _carregarDoacoes = async () => {
    _renderSkeleton();
    try {
      const res = await Utils.api.doacoes.listar({ limite: 80 });
      (res.data || []).forEach(_adicionarDoacao);
      _renderLista();
    } catch (err) {
      console.warn('Falha ao carregar doações:', err.message);
      document.getElementById('listItems').innerHTML =
        `<div class="empty-state" style="padding:var(--sp-8)">
          <div class="emo">⚠️</div>
          <h3>Falha ao carregar</h3>
          <p>${Utils.sanitize(err.message)}</p>
          <button class="btn btn--outline btn--sm" onclick="MapaPage.reload()" style="margin-top:1rem">Tentar novamente</button>
        </div>`;
    }
  };

  // ── Firebase Realtime Database ───────────────────────────
  //
  //  CONCEITO NoSQL Firebase:
  //  - Estrutura de árvore JSON na nuvem
  //  - onChildAdded:   dispara para cada filho existente + novos futuros
  //  - onChildChanged: dispara quando um nó muda
  //  - onChildRemoved: dispara quando um nó é removido
  //  O browser recebe updates automaticamente via WebSocket.
  //
  const _iniciarRealtime = () => {
    const db = window._fb?.database;
    if (!db) return;

    import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js')
      .then(({ ref, onChildAdded, onChildChanged, onChildRemoved }) => {
        const refDoacoes = ref(db, 'doacoes_ativas');

        // Quando uma nova doação é adicionada ao Firebase
        onChildAdded(refDoacoes, (snap) => {
          const d = { id: snap.key, ...snap.val() };
          if (!_doacoes[d.id]) {
            // Doação genuinamente nova (não veio da API inicial)
            setTimeout(() => {
              if (!_doacoes[d.id]) {
                _adicionarDoacao(d);
                _renderLista();
                Utils.toast.info(`🍽️ Nova doação: ${d.titulo}`);
              }
            }, 2000); // aguarda 2s para não duplicar com a carga inicial
          }
        });

        // Quando o status de uma doação muda
        onChildChanged(refDoacoes, (snap) => {
          const d = { id: snap.key, ...snap.val() };
          _doacoes[d.id] = d;
          if (d.status !== 'disponivel') {
            _removerMarcador(d.id);
          }
          _renderLista();
          // Fecha painel se a doação selecionada mudou de status
          if (_selecionado === d.id && d.status !== 'disponivel') {
            fecharDetalhe();
            Utils.toast.warning('Esta doação foi reservada ou expirou.');
          }
        });

        // Quando uma doação é removida do Firebase
        onChildRemoved(refDoacoes, (snap) => {
          _removerMarcador(snap.key);
          _renderLista();
        });
      })
      .catch((err) => console.warn('Firebase Realtime DB indisponível:', err.message));
  };

  // ── Adiciona marcador ao mapa e cache ────────────────────
  const _adicionarDoacao = (doacao) => {
    _doacoes[doacao.id || doacao._id] = doacao;
    const id = doacao.id || doacao._id;

    const coords = doacao.localizacao?.coordinates;
    if (!coords || coords.length < 2) return;
    const [lng, lat] = coords; // GeoJSON: [lng, lat]

    if (_markers[id]) {
      _markers[id].setLatLng([lat, lng]);
      return;
    }

    const marker = L.marker([lat, lng], {
      icon: criarIcone(doacao.tipo),
      title: doacao.titulo,
      alt: doacao.titulo,
    });

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      abrirDetalhe(id);
    });

    // Só adiciona ao mapa se passar no filtro atual
    if (_filtroTipo === 'todos' || doacao.tipo === _filtroTipo) {
      marker.addTo(_map);
    }

    _markers[id] = marker;
  };

  const _removerMarcador = (id) => {
    if (_markers[id]) {
      _map.removeLayer(_markers[id]);
      delete _markers[id];
    }
    delete _doacoes[id];
  };

  // ── Aplica filtros 
  const _aplicarFiltros = () => {
    Object.entries(_markers).forEach(([id, marker]) => {
      const d = _doacoes[id];
      if (!d) return;

      const passaTipo   = _filtroTipo === 'todos' || d.tipo === _filtroTipo;
      const passaCidade = !_buscaCidade ||
        (d.localizacao?.cidade || '').toLowerCase().includes(_buscaCidade.toLowerCase());

      if (passaTipo && passaCidade) {
        if (!_map.hasLayer(marker)) _map.addLayer(marker);
      } else {
        if (_map.hasLayer(marker)) _map.removeLayer(marker);
      }
    });
    _renderLista();
  };

  // ── Renderiza lista na sidebar ────────────────────────────
  const _renderSkeleton = () => {
    const el = document.getElementById('listaItems');
    if (!el) return;
    el.innerHTML = Array(5).fill(0).map(() => `
      <div class="skel-item">
        <div class="skeleton skel-ico"></div>
        <div class="skel-body">
          <div class="skeleton skel-line skel-line--lg"></div>
          <div class="skeleton skel-line skel-line--md"></div>
          <div class="skeleton skel-line skel-line--sm"></div>
        </div>
      </div>`).join('');
  };

  const _renderLista = () => {
    const el     = document.getElementById('listaItems');
    const emptyEl = document.getElementById('listaEmpty');
    if (!el) return;

    const visiveis = Object.values(_doacoes).filter((d) => {
      const passaTipo   = _filtroTipo === 'todos' || d.tipo === _filtroTipo;
      const passaCidade = !_buscaCidade ||
        (d.localizacao?.cidade || '').toLowerCase().includes(_buscaCidade.toLowerCase());
      return passaTipo && passaCidade && d.status === 'disponivel';
    });

    if (emptyEl) emptyEl.style.display = visiveis.length ? 'none' : 'block';

    el.innerHTML = visiveis.map((d) => {
      const id = d.id || d._id;
      const expirando = new Date(d.validoAte) - Date.now() < 2 * 3600 * 1000;
      return `
        <div class="doacao-item ${_selecionado === id ? 'selected' : ''}" data-id="${Utils.sanitize(id)}">
          <div class="doacao-item__icon">${EMOJIS[d.tipo] || '📋'}</div>
          <div class="doacao-item__body">
            <div class="doacao-item__titulo">${Utils.sanitize(d.titulo)}</div>
            <div class="doacao-item__info">
              📍 ${Utils.sanitize(d.localizacao?.cidade || '')}
              ${d.doadorSnapshot?.nome ? `· ${Utils.sanitize(d.doadorSnapshot.nome)}` : ''}
            </div>
            <div class="doacao-item__expiry ${expirando ? 'expirando' : ''}">
              ⏱ ${Utils.fmt.relativo(d.validoAte)}
              ${expirando ? '⚡ Expirando!' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Cliques na lista
    el.querySelectorAll('.doacao-item').forEach((item) => {
      item.addEventListener('click', () => abrirDetalhe(item.dataset.id));
    });
  };

  // ── Abre painel de detalhes 
  const abrirDetalhe = async (id) => {
    _selecionado = id;
    _renderLista();

    // Destaca marcador
    Object.entries(_markers).forEach(([mid, marker]) => {
      const d = _doacoes[mid];
      if (d) marker.setIcon(criarIcone(d.tipo, mid === id));
    });

    const panel  = document.getElementById('detalhePanel');
    const content = document.getElementById('detalhePanelContent');
    if (!panel || !content) return;

    // Exibe painel com loading
    panel.classList.remove('hidden');
    content.innerHTML = `
      <div class="detalhe-body" style="display:flex;align-items:center;justify-content:center;height:120px;gap:.75rem;color:var(--c-muted)">
        <div class="spinner spinner--sm"></div> Carregando...
      </div>`;

    // Centraliza o marcador no mapa
    const doacao = _doacoes[id];
    if (doacao?.localizacao?.coordinates) {
      const [lng, lat] = doacao.localizacao.coordinates;
      _map.panTo([lat, lng], { animate: true });
    }

    try {
      // Tenta buscar detalhes completos
      let d = doacao;
      try {
        const res = await Utils.api.doacoes.buscar(id);
        d = res.data;
        _doacoes[id] = d;
      } catch (_) { /* usa cache */ }

      if (!d) { fecharDetalhe(); return; }

      const expirado  = new Date(d.validoAte) < new Date();
      const usuario   = window._usuarioAtual;
      const podeReservar = !expirado && d.status === 'disponivel'
        && usuario && usuario.papel !== 'doador';

      content.innerHTML = `
        <div class="detalhe-body">
          <div class="detalhe-tipo">
            <span class="badge badge--green">${Utils.fmt.tipo(d.tipo)}</span>
            <span class="badge badge--${d.status === 'disponivel' ? 'success' : 'warn'}" style="margin-left:.3rem">
              ${Utils.fmt.status(d.status)}
            </span>
          </div>
          <h3 class="detalhe-titulo">${Utils.sanitize(d.titulo)}</h3>

          <div class="detalhe-meta">
            <div class="detalhe-meta-item">
              <span>🏪</span>
              <span>${Utils.sanitize(d.doadorSnapshot?.nome || 'Doador')}</span>
            </div>
            ${d.doadorSnapshot?.organizacao ? `
            <div class="detalhe-meta-item">
              <span>🏢</span>
              <span>${Utils.sanitize(d.doadorSnapshot.organizacao)}</span>
            </div>` : ''}
            <div class="detalhe-meta-item">
              <span>📍</span>
              <span>${Utils.sanitize(d.localizacao?.endereco || '')}, ${Utils.sanitize(d.localizacao?.cidade || '')}</span>
            </div>
            <div class="detalhe-meta-item">
              <span>⏱</span>
              <span class="detalhe-expiry ${expirado ? 'expirado' : ''}">
                ${expirado ? '⚠️ Expirada' : `Válida ${Utils.fmt.relativo(d.validoAte)}`}
              </span>
            </div>
          </div>

          ${d.descricao ? `<p style="font-size:.85rem;color:var(--c-muted);margin-bottom:var(--sp-5);line-height:1.6">${Utils.sanitize(d.descricao)}</p>` : ''}

          <div class="detalhe-itens">
            <h4>Itens (${(d.itens||[]).length})</h4>
            <ul>
              ${(d.itens||[]).map((it) =>
                `<li>${Utils.sanitize(it.quantidade)} ${Utils.sanitize(it.unidade)} de ${Utils.sanitize(it.nome)}</li>`
              ).join('')}
            </ul>
          </div>

          ${d.observacoes ? `<div class="detalhe-obs">💬 ${Utils.sanitize(d.observacoes)}</div>` : ''}

          ${podeReservar
            ? `<button class="btn btn--primary btn--full" id="btnReservarDetalhe" data-id="${Utils.sanitize(d.id||d._id)}">
                🤝 Reservar esta doação
               </button>`
            : !usuario
              ? `<a href="/auth.html?tab=login" class="btn btn--outline btn--full">Faça login para reservar</a>`
              : `<div style="text-align:center;padding:.8rem;background:var(--c-bg);border-radius:var(--r);font-size:.85rem;color:var(--c-muted)">
                  ${expirado ? '⏰ Expirada' : d.status === 'reservado' ? '✅ Já reservada' : '🔒 Indisponível'}
                 </div>`
          }
        </div>
      `;

      document.getElementById('btnReservarDetalhe')?.addEventListener('click', (e) => {
        reservarDoacao(e.currentTarget.dataset.id);
      });

    } catch (err) {
      content.innerHTML = `<div class="detalhe-body" style="color:var(--c-muted);text-align:center;padding:var(--sp-6)">
        <p>⚠️ ${Utils.sanitize(err.message)}</p>
      </div>`;
    }
  };

  const fecharDetalhe = () => {
    document.getElementById('detalhePanel')?.classList.add('hidden');
    // Reseta ícones para tamanho normal
    if (_selecionado) {
      const d = _doacoes[_selecionado];
      if (d && _markers[_selecionado]) {
        _markers[_selecionado].setIcon(criarIcone(d.tipo, false));
      }
    }
    _selecionado = null;
    _renderLista();
  };

  // ── Reservar doação 
  const reservarDoacao = async (id) => {
    const btn = document.getElementById('btnReservarDetalhe');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Reservando...'; }

    try {
      await Utils.api.doacoes.reservar(id);
      Utils.toast.success('Doação reservada! 🎉 Entre em contato com o doador.');
      _removerMarcador(id);
      fecharDetalhe();
      _renderLista();
    } catch (err) {
      Utils.toast.error(err.message || 'Falha ao reservar.');
      if (btn) { btn.disabled = false; btn.textContent = '🤝 Reservar esta doação'; }
    }
  };

  // ── Init 
  const initPage = () => {
    // Inicializa mapa após DOM
    init();

    // Filtros de tipo
    document.getElementById('filterChips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      _filtroTipo = chip.dataset.tipo;
      _aplicarFiltros();
    });

    // Busca por cidade (debounced)
    document.getElementById('buscaCidade')?.addEventListener('input',
      Utils.debounce((e) => {
        _buscaCidade = e.target.value.trim();
        _aplicarFiltros();
      }, 350)
    );

    // Fechar painel
    document.getElementById('detalheClose')?.addEventListener('click', fecharDetalhe);

    // Botão de minha localização
    document.getElementById('btnMinhaLoc')?.addEventListener('click', _geoLocalizarUsuario);
  };

  return { initPage, abrirDetalhe, fecharDetalhe, reload: _carregarDoacoes };
})();

// Expõe globalmente para uso inline
window.MapaPage = MapaPage;
document.addEventListener('DOMContentLoaded', MapaPage.initPage);
