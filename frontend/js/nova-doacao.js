//Formulário de Nova Doação (Multi-Step)
'use strict';

const NovaDoacao = (() => {
  const $ = (id) => document.getElementById(id);
  let _passo = 1;
  let _itens = []; // Array de itens da doação
  const TOTAL = 4;

  // ── Dados do formulário 
  const getDados = () => ({
    titulo:       $('titulo')?.value.trim() || '',
    tipo:         $('tipo')?.value || '',
    descricao:    $('descricao')?.value.trim() || '',
    validoAte:    $('validoAte')?.value || '',
    observacoes:  $('observacoes')?.value.trim() || '',
    itens:        _itens,
    localizacao: {
      endereco: $('locEndereco')?.value.trim() || '',
      cidade:   $('locCidade')?.value.trim() || '',
      estado:   $('locEstado')?.value || '',
      cep:      $('locCep')?.value.trim() || '',
      lat:      parseFloat($('locLat')?.value) || null,
      lng:      parseFloat($('locLng')?.value) || null,
    },
  });

  // ── Stepper visual 
  const atualizarStepper = () => {
    document.querySelectorAll('.step-dot').forEach((dot) => {
      const n = parseInt(dot.dataset.step);
      dot.classList.toggle('active', n === _passo);
      dot.classList.toggle('done',   n < _passo);
    });
    document.querySelectorAll('.step-dot__line').forEach((line, i) => {
      line.classList.toggle('done', i + 1 < _passo);
    });
    // Botões de navegação
    $('btnVoltar')?.style.setProperty('display', _passo > 1 ? '' : 'none');
    const isFinal = _passo === TOTAL;
    $('btnAvancar')?.classList.toggle('hidden', isFinal);
    $('btnPublicar')?.classList.toggle('hidden', !isFinal);
  };

  // ── Valida passo atual 
  const validarPasso = () => {
    let ok = true;
    if (_passo === 1) {
      const { validators, setError, clearError } = Utils;
      ['titulo','tipo','descricao','validoAte'].forEach((id) => clearError(id));

      const tituloEl = $('titulo');
      if (!tituloEl?.value.trim() || tituloEl.value.trim().length < 5) {
        setError('titulo', 'Título deve ter pelo menos 5 caracteres.'); ok = false;
      }
      if (!$('tipo')?.value) { setError('tipo', 'Selecione o tipo.'); ok = false; }
      if (($('descricao')?.value.trim().length || 0) < 10) {
        setError('descricao', 'Descrição deve ter pelo menos 10 caracteres.'); ok = false;
      }
      if (!$('validoAte')?.value) {
        setError('validoAte', 'Informe a data de validade.'); ok = false;
      } else {
        const d = new Date($('validoAte').value);
        const max = new Date(Date.now() + 7 * 24 * 3600 * 1000);
        if (d <= new Date()) { setError('validoAte', 'A data deve ser no futuro.'); ok = false; }
        if (d > max) { setError('validoAte', 'Máximo 7 dias a partir de hoje.'); ok = false; }
      }
    }
    if (_passo === 2) {
      const errEl = $('itensError');
      if (_itens.length === 0) {
        if (errEl) errEl.textContent = 'Adicione pelo menos 1 item.';
        ok = false;
      } else {
        if (errEl) errEl.textContent = '';
        // Valida cada item
        _itens.forEach((item, i) => {
          if (!item.nome?.trim())       { Utils.toast.warning(`Item ${i+1}: informe o nome.`); ok = false; }
          if (!item.quantidade?.trim()) { Utils.toast.warning(`Item ${i+1}: informe a quantidade.`); ok = false; }
          if (!item.unidade)            { Utils.toast.warning(`Item ${i+1}: informe a unidade.`); ok = false; }
        });
      }
    }
    if (_passo === 3) {
      ['locEndereco','locCidade','locEstado','locCep'].forEach((id) => Utils.clearError(id));
      const d = getDados().localizacao;
      if (!d.endereco) { Utils.setError('locEndereco','Informe o endereço.'); ok = false; }
      if (!d.cidade)   { Utils.setError('locCidade',  'Informe a cidade.'); ok = false; }
      if (!d.estado)   { Utils.setError('locEstado',  'Selecione o estado.'); ok = false; }
      if (!d.cep)      { Utils.setError('locCep',     'Informe o CEP.'); ok = false; }
      if (!d.lat || !d.lng) { Utils.toast.warning('Clique em "Obter coordenadas" para confirmar o endereço.'); ok = false; }
    }
    return ok;
  };

  // ── Navega entre passos 
  const irPara = (n) => {
    document.querySelectorAll('.form-step').forEach((s, i) => {
      s.classList.toggle('active', i + 1 === n);
      s.classList.toggle('hidden', i + 1 !== n);
    });
    _passo = n;
    atualizarStepper();
    if (n === 4) renderRevisao();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Itens 
  const adicionarItem = () => {
    if (_itens.length >= 20) { Utils.toast.warning('Máximo de 20 itens por doação.'); return; }
    const idx = _itens.length;
    _itens.push({ nome:'', quantidade:'', unidade:'' });
    renderItens();
  };

  const removerItem = (idx) => {
    _itens.splice(idx, 1);
    renderItens();
  };

  const renderItens = () => {
    const c = $('itensContainer');
    if (!c) return;
    if (_itens.length === 0) {
      c.innerHTML = `<div class="empty-state" style="padding:var(--sp-8)"><div class="emo">🍱</div><h3>Nenhum item</h3><p>Clique abaixo para adicionar.</p></div>`;
      return;
    }
    c.innerHTML = _itens.map((item, i) => `
      <div class="item-row" id="itemRow${i}">
        <div class="form-group">
          <label>Nome do alimento *</label>
          <input class="input item-nome" type="text" data-idx="${i}"
            placeholder="Ex: Arroz branco" value="${Utils.sanitize(item.nome)}" maxlength="100"/>
        </div>
        <div class="form-group">
          <label>Quantidade *</label>
          <input class="input item-qtd" type="text" data-idx="${i}"
            placeholder="Ex: 5" value="${Utils.sanitize(item.quantidade)}" maxlength="20"/>
        </div>
        <div class="form-group">
          <label>Unidade *</label>
          <select class="input item-uni" data-idx="${i}">
            <option value="">Unidade</option>
            <option value="kg"    ${item.unidade==='kg'    ?'selected':''}>kg</option>
            <option value="g"     ${item.unidade==='g'     ?'selected':''}>g</option>
            <option value="L"     ${item.unidade==='L'     ?'selected':''}>L</option>
            <option value="ml"    ${item.unidade==='ml'    ?'selected':''}>ml</option>
            <option value="unidade"${item.unidade==='unidade'?'selected':''}>unidade</option>
            <option value="porção"${item.unidade==='porção'?'selected':''}>porção</option>
            <option value="caixa" ${item.unidade==='caixa' ?'selected':''}>caixa</option>
          </select>
        </div>
        <button type="button" class="item-remove" data-idx="${i}" aria-label="Remover item ${i+1}">✕</button>
      </div>
    `).join('');

    // Event listeners para atualizar _itens ao digitar
    c.querySelectorAll('.item-nome').forEach((el) => {
      el.addEventListener('input', () => { _itens[el.dataset.idx].nome = el.value; });
    });
    c.querySelectorAll('.item-qtd').forEach((el) => {
      el.addEventListener('input', () => { _itens[el.dataset.idx].quantidade = el.value; });
    });
    c.querySelectorAll('.item-uni').forEach((el) => {
      el.addEventListener('change', () => { _itens[el.dataset.idx].unidade = el.value; });
    });
    c.querySelectorAll('.item-remove').forEach((btn) => {
      btn.addEventListener('click', () => removerItem(parseInt(btn.dataset.idx)));
    });
  };

  // ── Geocodificação (endereço → coordenadas) ───────────────
  const buscarCoordenadas = async () => {
    const d = getDados().localizacao;
    if (!d.endereco || !d.cidade || !d.estado) {
      Utils.toast.warning('Preencha endereço, cidade e estado primeiro.');
      return;
    }

    const btn = $('btnBuscarCoordenadas');
    if (btn) { btn.textContent = '⏳ Buscando...'; btn.disabled = true; }

    try {
      const query = encodeURIComponent(`${d.endereco}, ${d.cidade}, ${d.estado}, Brasil`);
      // Nominatim é gratuito — em produção use Google Maps Geocoding API
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
        headers: { 'Accept-Language':'pt-BR', 'User-Agent':'FoodBridge/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();

      if (!data.length) { Utils.toast.error('Endereço não encontrado. Verifique os dados.'); return; }

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);

      const latEl = $('locLat'), lngEl = $('locLng');
      if (latEl) latEl.value = lat;
      if (lngEl) lngEl.value = lng;

      const display = $('coordDisplay');
      const text    = $('coordText');
      if (display) display.classList.remove('hidden');
      if (text) text.textContent = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;

      Utils.toast.success('Coordenadas obtidas com sucesso!');
    } catch (err) {
      Utils.toast.error('Falha ao buscar coordenadas. Verifique sua conexão.');
    } finally {
      if (btn) { btn.textContent = '📍 Obter coordenadas pelo endereço'; btn.disabled = false; }
    }
  };

  // ── Revisão 
  const renderRevisao = () => {
    const el = $('revisaoGrid');
    if (!el) return;
    const d = getDados();
    el.innerHTML = `
      <div class="revisao-item">
        <div class="revisao-item__label">Título</div>
        <div class="revisao-item__value">${Utils.sanitize(d.titulo)}</div>
      </div>
      <div class="revisao-item">
        <div class="revisao-item__label">Tipo</div>
        <div class="revisao-item__value">${Utils.fmt.tipo(d.tipo)}</div>
      </div>
      <div class="revisao-item revisao-item--full">
        <div class="revisao-item__label">Descrição</div>
        <div class="revisao-item__value">${Utils.sanitize(d.descricao)}</div>
      </div>
      <div class="revisao-item">
        <div class="revisao-item__label">Válido até</div>
        <div class="revisao-item__value">${Utils.fmt.dataHora(d.validoAte)}</div>
      </div>
      <div class="revisao-item">
        <div class="revisao-item__label">Local</div>
        <div class="revisao-item__value">${Utils.sanitize(d.localizacao.cidade)}, ${Utils.sanitize(d.localizacao.estado)}</div>
      </div>
      <div class="revisao-item revisao-item--full">
        <div class="revisao-item__label">Itens (${d.itens.length})</div>
        <ul class="revisao-item__list">
          ${d.itens.map((it) => `<li>${Utils.sanitize(it.quantidade)} ${Utils.sanitize(it.unidade)} de ${Utils.sanitize(it.nome)}</li>`).join('')}
        </ul>
      </div>
      ${d.observacoes ? `
      <div class="revisao-item revisao-item--full">
        <div class="revisao-item__label">Observações</div>
        <div class="revisao-item__value">${Utils.sanitize(d.observacoes)}</div>
      </div>` : ''}
    `;
  };

  // ── Submissão 
  const publicar = async () => {
    const d = getDados();
    const btn = $('btnPublicar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Publicando...'; }

    try {
      await Utils.api.doacoes.criar({
        titulo:      d.titulo,
        descricao:   d.descricao,
        tipo:        d.tipo,
        itens:       d.itens,
        validoAte:   new Date(d.validoAte).toISOString(),
        observacoes: d.observacoes || undefined,
        localizacao: {
          endereco: d.localizacao.endereco,
          cidade:   d.localizacao.cidade,
          estado:   d.localizacao.estado,
          cep:      d.localizacao.cep,
          lat:      d.localizacao.lat,
          lng:      d.localizacao.lng,
        },
      });

      Utils.toast.success('Doação publicada com sucesso! 🎉', 5000);
      setTimeout(() => window.location.href = '/dashboard.html', 1500);
    } catch (err) {
      Utils.toast.error(err.message || 'Falha ao publicar.');
      if (btn) { btn.disabled = false; btn.textContent = '🌱 Publicar Doação'; }
    }
  };

  // ── Init 
  const init = () => {
    // Define data mínima como agora e máxima como daqui 7 dias
    const dtEl = $('validoAte');
    if (dtEl) {
      const agora = new Date(Date.now() + 5 * 60000); // +5min
      const max   = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      dtEl.min = agora.toISOString().slice(0,16);
      dtEl.max = max.toISOString().slice(0,16);
    }

    // Contador de caracteres da descrição
    $('descricao')?.addEventListener('input', () => {
      const c = $('descricaoCount');
      const v = $('descricao').value.length;
      if (c) c.textContent = `${v}/1000 caracteres`;
    });

    // Máscara de CEP
    $('locCep')?.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g,'');
      if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,8);
      e.target.value = v;
    });

    // Itens
    adicionarItem(); // 1 item inicial
    $('btnAddItem')?.addEventListener('click', adicionarItem);

    // Geocodificação
    $('btnBuscarCoordenadas')?.addEventListener('click', buscarCoordenadas);

    // Navegação
    $('btnAvancar')?.addEventListener('click', () => {
      if (validarPasso()) irPara(_passo + 1);
    });
    $('btnVoltar')?.addEventListener('click', () => {
      if (_passo > 1) irPara(_passo - 1);
    });
    $('btnPublicar')?.addEventListener('click', publicar);

    // Verifica se é doador
    document.addEventListener('authReady', ({ detail }) => {
      const u = detail.usuario;
      if (!u) return; // init.js redireciona
      if (u.papel !== 'doador' && u.papel !== 'admin') {
        Utils.toast.error('Apenas doadores podem criar doações.');
        setTimeout(() => window.location.href = '/dashboard.html', 2000);
      }
    });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', NovaDoacao.init);
