// Utilitários Compartilhados

'use strict';

const Utils = (() => {

  // ── Sanitização de Output (Anti-XSS) ───────────────────────
  const sanitize = (str) => {
    if (str === null || str === undefined) return '';
    const map = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','`':'&#x60;' };
    return String(str).replace(/[&<>"'`]/g, (m) => map[m]);
  };

  // ── Validadores ─────────────────────────────────────────────
  const validators = {
    email:    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v||'').trim()),
    senha:    (v) => (v||'').length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v),
    nome:     (v) => (v||'').trim().length >= 2 && (v||'').trim().length <= 100,
    naoVazio: (v) => (v||'').trim().length > 0,
    mongoId:  (v) => /^[a-f\d]{24}$/i.test(v||''),
  };

  // ── Força de Senha ──────────────────────────────────────────
  const forca = (s) => {
    let p = 0;
    if (s.length >= 8)  p++; if (s.length >= 12) p++;
    if (/[A-Z]/.test(s)) p++; if (/\d/.test(s)) p++;
    if (/[^A-Za-z0-9]/.test(s)) p++;
    return [
      { label:'Muito fraca', cor:'#DC2626', w:'15%' },
      { label:'Fraca',       cor:'#F97316', w:'35%' },
      { label:'Razoável',    cor:'#EAB308', w:'55%' },
      { label:'Forte',       cor:'#22C55E', w:'80%' },
      { label:'Muito forte', cor:'#16A34A', w:'100%' },
    ][Math.min(p, 4)];
  };

  // ── Formulários ─────────────────────────────────────────────
  const setError = (id, msg) => {
    const inp = typeof id === 'string' ? document.getElementById(id) : id;
    const err = document.getElementById(`${inp?.id}Error`);
    inp?.classList.add('error');
    if (err) err.textContent = msg;
  };
  const clearError = (id) => {
    const inp = typeof id === 'string' ? document.getElementById(id) : id;
    const err = document.getElementById(`${inp?.id}Error`);
    inp?.classList.remove('error');
    if (err) err.textContent = '';
  };
  const clearAllErrors = (form) => {
    form?.querySelectorAll('.input.error').forEach((el) => {
      el.classList.remove('error');
      const err = document.getElementById(`${el.id}Error`);
      if (err) err.textContent = '';
    });
  };

  // ── Toast ────────────────────────────────────────────────────
  const toast = (() => {
    const container = () => {
      let c = document.getElementById('toastContainer');
      if (!c) {
        c = document.createElement('div');
        c.id = 'toastContainer';
        document.body.appendChild(c);
      }
      return c;
    };

    const show = (mensagem, tipo = 'info', ms = 4000) => {
      const el = document.createElement('div');
      el.className = `toast toast--${tipo}`;
      el.setAttribute('role', 'alert');

      const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
      const ico = document.createElement('span'); ico.textContent = icons[tipo]||'ℹ️';
      const txt = document.createElement('span'); txt.textContent = mensagem;
      el.append(ico, txt);
      container().appendChild(el);

      setTimeout(() => {
        el.style.cssText = 'opacity:0;transform:translateX(12px);transition:all .25s ease';
        setTimeout(() => el.remove(), 250);
      }, ms);
    };

    return {
      show,
      success: (m, ms) => show(m, 'success', ms),
      error:   (m, ms) => show(m, 'error', ms||6000),
      warning: (m, ms) => show(m, 'warning', ms),
      info:    (m, ms) => show(m, 'info', ms),
    };
  })();

  // ── API Client ──────────────────────────────────────────────
  const api = (() => {
    
    const BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : 'https://ponte-alimentar.onrender.com/api';

    const token = async () => {
      const auth = window._fb?.auth;
      if (!auth?.currentUser) return null;
      try { return await auth.currentUser.getIdToken(false); }
      catch { return null; }
    };

    const req = async (method, path, body) => {
      const tk = await token();
      const headers = { 'Content-Type':'application/json', 'X-Request-ID': crypto.randomUUID() };
      if (tk) headers['Authorization'] = `Bearer ${tk}`;

      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      let json;
      try { json = await res.json(); } catch { throw new Error('Resposta inválida do servidor.'); }
      if (!res.ok) throw Object.assign(new Error(json?.message || 'Erro na requisição.'), { status: res.status, data: json });
      return json;
    };

    return {
      get:    (p)    => req('GET',    p),
      post:   (p, b) => req('POST',   p, b),
      patch:  (p, b) => req('PATCH',  p, b),
      delete: (p)    => req('DELETE', p),

      auth: {
        registrar:   (d) => req('POST', '/auth/registrar', d),
        sincronizar: ()  => req('POST', '/auth/sincronizar'),
        perfil:      ()  => req('GET',  '/auth/perfil'),
      },
      doacoes: {
        listar:    (params = {}) => {
          const qs = new URLSearchParams(
            Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))
          );
          return req('GET', `/doacoes?${qs}`);
        },
        buscar:    (id)         => req('GET',    `/doacoes/${encodeURIComponent(id)}`),
        criar:     (d)          => req('POST',   '/doacoes', d),
        reservar:  (id, msg)    => req('POST',   `/doacoes/${encodeURIComponent(id)}/reservar`, { mensagem: msg||'' }),
        status:    (id, s, m)   => req('PATCH',  `/doacoes/${encodeURIComponent(id)}/status`, { status:s, motivo:m }),
        cancelar:  (id)         => req('DELETE', `/doacoes/${encodeURIComponent(id)}`),
      },
    };
  })();

  // Expõe api globalmente para init.js usar
  window._api = api;

  // ── Formatadores ─────────────────────────────────────────────
  const fmt = {
    data: (iso) => new Date(iso).toLocaleDateString('pt-BR'),
    hora: (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    dataHora: (iso) => `${fmt.data(iso)} às ${fmt.hora(iso)}`,
    relativo: (iso) => {
      const d = Math.abs(new Date(iso) - Date.now());
      const passado = new Date(iso) < Date.now();
      const mins = Math.floor(d/60000), hrs = Math.floor(d/3600000), dias = Math.floor(d/86400000);
      if (mins < 1)  return passado ? 'agora'          : 'em instantes';
      if (mins < 60) return passado ? `há ${mins}min`  : `em ${mins}min`;
      if (hrs  < 24) return passado ? `há ${hrs}h`     : `em ${hrs}h`;
      return passado ? `há ${dias}d` : `em ${dias} dia${dias>1?'s':''}`;
    },
    tipo: (t) => ({
      refeicao_pronta:'🍽️ Refeição pronta',
      alimento_nao_perecivel:'📦 Não perecível',
      fruta_legume:'🥦 Fruta/Legume',
      padaria:'🥖 Padaria',
      outro:'📋 Outro',
    }[t] || t),
    status: (s) => ({
      disponivel:'✅ Disponível', reservado:'🔒 Reservado',
      coletado:'📦 Coletado',    expirado:'⏰ Expirado', cancelado:'❌ Cancelado',
    }[s] || s),
    papel: (p) => ({ doador:'🏪 Doador', receptor:'🤝 Receptor', voluntario:'🛵 Voluntário', admin:'🛠 Admin' }[p] || p),
    numero: (n) => Number(n).toLocaleString('pt-BR'),
  };

  // ── Debounce ─────────────────────────────────────────────────
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ── Toggle senha (input password) ────────────────────────────
  const initToggleSenha = (containerId) => {
    const root = containerId ? document.getElementById(containerId) : document;
    root?.querySelectorAll('[data-toggle-senha]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.toggleSenha);
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        btn.textContent = inp.type === 'password' ? '👁' : '🙈';
      });
    });
  };

  // ── Força senha em tempo real ─────────────────────────────────
  const initForcaSenha = (inputId, barId) => {
    const inp = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    if (!inp || !bar) return;
    inp.addEventListener('input', () => {
      if (!inp.value) { bar.style.width = '0'; return; }
      const f = forca(inp.value);
      bar.style.width = f.w;
      bar.style.background = f.cor;
      bar.title = f.label;
    });
  };

  // ── Contador animado ──────────────────────────────────────────
  const animarContador = (el, target, duracao = 1400) => {
    const step = target / (duracao / 16);
    let cur = 0;
    const t = setInterval(() => {
      cur += step;
      if (cur >= target) { el.textContent = fmt.numero(target); clearInterval(t); }
      else el.textContent = fmt.numero(Math.floor(cur));
    }, 16);
  };

  // ── URL params ───────────────────────────────────────────────
  const getParam = (key) => new URLSearchParams(window.location.search).get(key);

  return { sanitize, validators, forca, setError, clearError, clearAllErrors,
           toast, api, fmt, debounce, initToggleSenha, initForcaSenha,
           animarContador, getParam };
})();

window.Utils = Utils;
