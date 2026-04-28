(() => {
  "use strict";

  const STORAGE_KEY = "vota_facil_state_v3";
  const VOTER_ID_KEY = "vota_facil_voter_id";

  const COLORS = [
    "#38bdf8", "#0ea5e9", "#7dd3fc", "#0284c7", "#bae6fd",
    "#0369a1", "#93c5fd", "#1d4ed8", "#60a5fa", "#2563eb",
  ];

  const OPTION_BADGES = [
    ["#eef2ff", "#4338ca"],
    ["#f5f3ff", "#6d28d9"],
    ["#eff6ff", "#1d4ed8"],
    ["#ecfeff", "#0e7490"],
    ["#faf5ff", "#7e22ce"],
    ["#f0f9ff", "#0369a1"],
  ];

  const app = document.getElementById("app");
  const ui = {
    selectedPollId: null,
    adminTab: "editor",
    changingVotes: new Set(),
    selectedVoteOption: {},
    draft: null,
    toastTimer: null,
    toastMessage: "",
  };

  function createId(prefix = "id") {
    if (window.crypto && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  }

  function toDatetimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromDatetimeLocal(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function getColor(option, index) {
    const lower = String(option || "").toLowerCase();
    if (lower.includes("menina") || lower.includes("girl") || lower.includes("rosa")) return "#f472b6";
    if (lower.includes("menino") || lower.includes("boy") || lower.includes("azul")) return "#38bdf8";
    return COLORS[index % COLORS.length];
  }

  function sampleState() {
    const created = nowIso();
    const pollId = createId("poll");
    return {
      version: 3,
      polls: [
        {
          id: pollId,
          title: "Qual será o tema da próxima votação?",
          description: "Enquete de exemplo. Edite ou crie novas enquetes no painel Admin.",
          options: ["Tecnologia", "Eventos", "Comunidade", "Produto"],
          is_published: true,
          is_active: true,
          allow_results_view: true,
          lock_at: null,
          created_date: created,
          updated_date: created,
        },
      ],
      votes: [],
    };
  }

  function normalizeState(value) {
    const state = value && typeof value === "object" ? value : sampleState();
    state.version = 3;
    state.polls = Array.isArray(state.polls) ? state.polls : [];
    state.votes = Array.isArray(state.votes) ? state.votes : [];

    state.polls = state.polls.map((poll) => ({
      id: poll.id || createId("poll"),
      title: poll.title || "Enquete sem título",
      description: poll.description || "",
      options: Array.isArray(poll.options) && poll.options.length >= 2 ? poll.options : ["Opção 1", "Opção 2"],
      is_published: poll.is_published !== false,
      is_active: poll.is_active !== false,
      allow_results_view: poll.allow_results_view !== false,
      lock_at: poll.lock_at || null,
      created_date: poll.created_date || nowIso(),
      updated_date: poll.updated_date || poll.created_date || nowIso(),
    }));

    state.votes = state.votes
      .filter((vote) => vote && vote.poll_id && vote.option)
      .map((vote) => ({
        id: vote.id || createId("vote"),
        poll_id: vote.poll_id,
        option: vote.option,
        voter_id: vote.voter_id || vote.voter_email || createId("voter"),
        voter_email: vote.voter_email || "anonimo@local.vote",
        voter_name: vote.voter_name || "Anônimo",
        created_date: vote.created_date || nowIso(),
        updated_date: vote.updated_date || vote.created_date || nowIso(),
      }));

    return state;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const state = normalizeState(parsed);
      const changed = closeExpiredPolls(state);
      if (!raw || changed) saveState(state, { silent: true });
      return state;
    } catch (error) {
      console.warn("Falha ao ler os dados locais. Usando estado inicial.", error);
      const state = sampleState();
      saveState(state, { silent: true });
      return state;
    }
  }

  function saveState(state, options = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent("vota-facil:changed"));
    }
  }

  function closeExpiredPolls(state) {
    const now = Date.now();
    let changed = false;
    state.polls.forEach((poll) => {
      if (poll.is_active && poll.lock_at) {
        const lockAt = new Date(poll.lock_at).getTime();
        if (!Number.isNaN(lockAt) && lockAt <= now) {
          poll.is_active = false;
          poll.updated_date = nowIso();
          changed = true;
        }
      }
    });
    return changed;
  }

  function listPolls(state = loadState()) {
    return [...state.polls].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  }

  function votesForPoll(pollId, state = loadState()) {
    return state.votes.filter((vote) => vote.poll_id === pollId);
  }

  function getVoterId() {
    let id = localStorage.getItem(VOTER_ID_KEY);
    if (!id) {
      id = createId("voter");
      localStorage.setItem(VOTER_ID_KEY, id);
    }
    return id;
  }

  function visiblePolls(state = loadState()) {
    return listPolls(state).filter((poll) => {
      if (poll.is_published === false) return false;
      const title = String(poll.title || "").toLowerCase();
      const isBabyGender = title.includes("baby");
      return poll.is_active || poll.allow_results_view !== false || isBabyGender;
    });
  }

  function voteInPoll(pollId, option) {
    const state = loadState();
    const poll = state.polls.find((item) => item.id === pollId);
    if (!poll || !poll.is_active) return showToast("Essa votação não está aberta.");
    if (!poll.options.includes(option)) return showToast("Opção inválida para esta enquete.");

    const voterId = getVoterId();
    const existing = state.votes.find((vote) => vote.poll_id === pollId && vote.voter_id === voterId);
    if (existing) {
      existing.option = option;
      existing.updated_date = nowIso();
    } else {
      state.votes.push({
        id: createId("vote"),
        poll_id: pollId,
        option,
        voter_id: voterId,
        voter_email: `anon_${voterId.slice(-8)}@local.vote`,
        voter_name: "Anônimo",
        created_date: nowIso(),
        updated_date: nowIso(),
      });
    }
    ui.changingVotes.delete(pollId);
    ui.selectedVoteOption[pollId] = option;
    saveState(state);
    showToast(existing ? "Voto alterado com sucesso." : "Voto registrado com sucesso.");
    render();
  }

  function savePollFromDraft(draft, id = null) {
    const cleanOptions = (draft.options || []).map((option) => option.trim()).filter(Boolean);
    if (!draft.title.trim()) return showToast("Informe um título para a enquete.");
    if (cleanOptions.length < 2) return showToast("Informe pelo menos duas opções de voto.");

    const state = loadState();
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      options: cleanOptions,
      is_published: Boolean(draft.is_published),
      is_active: Boolean(draft.is_active),
      allow_results_view: Boolean(draft.allow_results_view),
      lock_at: fromDatetimeLocal(draft.lock_at),
      updated_date: nowIso(),
    };

    if (id) {
      const index = state.polls.findIndex((poll) => poll.id === id);
      if (index >= 0) {
        state.polls[index] = { ...state.polls[index], ...payload };
        const valid = new Set(cleanOptions);
        state.votes = state.votes.filter((vote) => vote.poll_id !== id || valid.has(vote.option));
        showToast("Enquete atualizada.");
      }
    } else {
      const created = { id: createId("poll"), ...payload, created_date: nowIso() };
      state.polls.push(created);
      ui.selectedPollId = created.id;
      showToast("Enquete criada.");
    }

    ui.draft = null;
    saveState(state);
    render();
  }

  function resetVotes(pollId) {
    const state = loadState();
    const poll = state.polls.find((item) => item.id === pollId);
    if (!poll) return;
    if (!confirm(`Zerar todos os votos de "${poll.title}"? Esta ação não pode ser desfeita.`)) return;
    state.votes = state.votes.filter((vote) => vote.poll_id !== pollId);
    saveState(state);
    showToast("Votos zerados.");
    render();
  }

  function deletePoll(pollId) {
    const state = loadState();
    const poll = state.polls.find((item) => item.id === pollId);
    if (!poll) return;
    if (!confirm(`Excluir a enquete "${poll.title}" e todos os votos dela?`)) return;
    state.polls = state.polls.filter((item) => item.id !== pollId);
    state.votes = state.votes.filter((vote) => vote.poll_id !== pollId);
    if (ui.selectedPollId === pollId) ui.selectedPollId = null;
    ui.draft = null;
    saveState(state);
    showToast("Enquete excluída.");
    render();
  }

  function resetAllData() {
    if (!confirm("Restaurar o projeto para os dados de exemplo? Isso apaga as enquetes e votos atuais deste navegador.")) return;
    localStorage.removeItem(STORAGE_KEY);
    ui.selectedPollId = null;
    ui.draft = null;
    saveState(sampleState());
    showToast("Dados restaurados.");
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(loadState(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vota-facil-dados-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const state = normalizeState(parsed);
        saveState(state);
        ui.selectedPollId = null;
        ui.draft = null;
        showToast("Dados importados.");
        render();
      } catch (error) {
        showToast("Não foi possível importar o JSON.");
      }
    };
    reader.readAsText(file);
  }

  function routeName() {
    const raw = window.location.hash.replace(/^#\/?/, "");
    return raw || "Vote";
  }

  function setRoute(name) {
    window.location.hash = `#/${name}`;
  }

  function layout(content) {
    const route = routeName();
    return `
      <nav class="navbar">
        <div class="nav-inner">
          <a href="#/Vote" class="brand" aria-label="Ir para votação">
            <span class="brand-mark">✓</span>
            <span>Vota Fácil</span>
          </a>
          <div class="nav-links">
            <a class="nav-link ${route === "Vote" ? "active" : ""}" href="#/Vote">🗳️ <span>Votação</span></a>
            <a class="nav-link ${route === "AdminPoll" ? "active" : ""}" href="#/AdminPoll">🛡️ <span>Admin</span></a>
          </div>
        </div>
      </nav>
      ${content}
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    `;
  }

  function render() {
    closeExpiredPollsAndPersist();
    const route = routeName();
    if (route === "Vote") app.innerHTML = layout(renderVotePage());
    else if (route === "AdminPoll") app.innerHTML = layout(renderAdminPage());
    else app.innerHTML = layout(render404(route));
    bindEvents();
  }

  function closeExpiredPollsAndPersist() {
    const state = loadState();
    if (closeExpiredPolls(state)) saveState(state, { silent: true });
  }

  function renderVotePage() {
    const state = loadState();
    const polls = visiblePolls(state);
    if (!polls.length) {
      return `
        <main class="vote-page">
          <section class="empty-state">
            <div class="big-icon">📊</div>
            <h2>Nenhuma enquete ativa</h2>
            <p>Aguarde o administrador criar ou publicar uma nova votação.</p>
          </section>
        </main>
      `;
    }

    return `
      <main class="vote-page">
        <section class="vote-shell">
          ${polls.map((poll) => renderPollCard(poll, votesForPoll(poll.id, state))).join("")}
        </section>
      </main>
    `;
  }

  function renderPollCard(poll, votes) {
    const voterId = getVoterId();
    const userVote = votes.find((vote) => vote.voter_id === voterId);
    const selected = ui.selectedVoteOption[poll.id] || userVote?.option || "";
    const hasVoted = Boolean(userVote);
    const changing = ui.changingVotes.has(poll.id);
    const canShowResults = poll.allow_results_view !== false || !poll.is_active;

    return `
      <article class="poll-card" data-poll-id="${escapeHtml(poll.id)}">
        <header class="poll-heading">
          <h2>${escapeHtml(poll.title)}</h2>
          ${poll.description ? `<p>${escapeHtml(poll.description)}</p>` : ""}
        </header>
        ${poll.is_active ? `
          <div class="glass-card">
            ${renderVoteForm(poll, { hasVoted, changing, selected, userVote: userVote?.option })}
          </div>
        ` : ""}
        ${canShowResults ? `
          <div class="glass-card">
            ${!poll.is_active ? `<div class="result-lock-line"><span>🔒</span><span>Votação encerrada</span></div>` : ""}
            ${renderVoteChart(poll.options, votes, true)}
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderVoteForm(poll, { hasVoted, changing, selected, userVote }) {
    if (!poll.is_active) {
      return `
        <div class="locked-box">
          <div class="lock">🔒</div>
          <h3>Votação encerrada</h3>
          <p>Esta enquete não está mais aceitando votos.</p>
        </div>
      `;
    }

    if (hasVoted && !changing) {
      return `
        <div class="confirmed-vote">
          <div class="confirm-icon">✓</div>
          <h3>Voto registrado!</h3>
          <p>Você votou em <strong>"${escapeHtml(userVote)}"</strong></p>
          <button class="btn ghost-white small" data-change-vote="${escapeHtml(poll.id)}">↻ Mudar meu voto</button>
        </div>
      `;
    }

    return `
      <div class="vote-form">
        ${hasVoted ? `<p class="muted-help" style="color:rgba(255,255,255,.72); text-align:center; margin-bottom:14px;">Selecione uma nova opção para alterar seu voto</p>` : ""}
        <div class="option-list">
          ${(poll.options || []).map((option, index) => `
            <button
              class="vote-option ${selected === option ? "selected" : ""}"
              data-select-option="${escapeHtml(option)}"
              data-poll="${escapeHtml(poll.id)}"
              style="animation-delay:${index * 40}ms"
            >${escapeHtml(option)}</button>
          `).join("")}
        </div>
        <div class="vote-actions">
          ${hasVoted ? `<button class="btn ghost-white" data-cancel-change="${escapeHtml(poll.id)}">Cancelar</button>` : ""}
          <button class="btn white" data-confirm-vote="${escapeHtml(poll.id)}" ${!selected || selected === userVote ? "disabled" : ""}>
            ${hasVoted ? "Alterar Voto" : "Confirmar Voto"}
          </button>
        </div>
      </div>
    `;
  }

  function renderVoteChart(options = [], votes = [], lightText = false) {
    const total = votes.length;
    const rows = options.map((option, index) => ({
      option,
      count: votes.filter((vote) => vote.option === option).length,
      color: getColor(option, index),
    }));

    return `
      <div class="chart">
        <div class="chart-head">
          <h3 style="${lightText ? "" : "color:#475569"}">Resultados</h3>
          <span class="vote-count-pill" style="${lightText ? "" : "background:#f1f5f9;color:#475569"}">${total} voto${total !== 1 ? "s" : ""}</span>
        </div>
        <div class="chart-list">
          ${rows.map((row) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
            return `
              <div class="chart-row">
                <div class="chart-row-meta">
                  <span class="chart-name" style="${lightText ? "" : "color:#334155"}">${escapeHtml(row.option)}</span>
                  <span class="chart-numbers" style="${lightText ? "" : "color:#0f172a"}"><small style="${lightText ? "" : "color:#94a3b8"}">${row.count}v</small>${pct}%</span>
                </div>
                <div class="progress" style="${lightText ? "" : "background:#e2e8f0"}">
                  <div class="progress-fill" style="width:${pct}%; min-width:${pct > 0 ? "10px" : "0"}; background:${row.color}; box-shadow:0 0 8px ${row.color}80"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderAdminPage() {
    const state = loadState();
    const polls = listPolls(state);
    if (!ui.selectedPollId && polls.length > 0) ui.selectedPollId = polls[0].id;
    const selectedPoll = ui.selectedPollId === "new" ? null : polls.find((poll) => poll.id === ui.selectedPollId) || polls[0] || null;
    if (selectedPoll && ui.selectedPollId !== selectedPoll.id) ui.selectedPollId = selectedPoll.id;
    const votes = selectedPoll ? votesForPoll(selectedPoll.id, state) : [];

    return `
      <main class="admin-page">
        <section class="admin-shell">
          <header class="admin-header">
            <div class="hero-label">🛡️ Painel Admin</div>
            <h1 class="admin-title">Gerenciar Enquetes</h1>
            <p class="admin-subtitle">Crie, edite e acompanhe votações salvas no navegador, sem backend externo.</p>
          </header>

          <div class="poll-selector">
            ${polls.map((poll) => `
              <button class="poll-chip ${ui.selectedPollId === poll.id ? "active" : ""} ${poll.is_published === false ? "hidden-poll" : ""}" data-select-poll="${escapeHtml(poll.id)}">
                ${escapeHtml(poll.title || "(sem título)")}
              </button>
            `).join("")}
            <button class="poll-chip ${ui.selectedPollId === "new" || !polls.length ? "active" : ""}" data-new-poll>+ Nova Enquete</button>
          </div>

          <div class="tabs" role="tablist" aria-label="Seções do painel">
            <button class="tab-btn ${ui.adminTab === "editor" ? "active" : ""}" data-tab="editor">⚙️ Configurar</button>
            <button class="tab-btn ${ui.adminTab === "results" ? "active" : ""}" data-tab="results">📊 Resultados</button>
            <button class="tab-btn ${ui.adminTab === "voters" ? "active" : ""}" data-tab="voters">👥 Votantes (${votes.length})</button>
          </div>

          <div class="admin-card">
            <div class="card-pad">
              ${renderAdminTab(selectedPoll, votes)}
            </div>
          </div>

          <div class="kicker-row">
            <span>Dados locais: <strong>${polls.length}</strong> enquete${polls.length !== 1 ? "s" : ""} · <strong>${state.votes.length}</strong> voto${state.votes.length !== 1 ? "s" : ""}</span>
            <div class="actions-row">
              <button class="btn outline small" data-export>Exportar JSON</button>
              <label class="btn outline small" for="import-json">Importar JSON</label>
              <input class="file-input" id="import-json" type="file" accept="application/json" data-import />
              <button class="btn danger small" data-reset-all>Restaurar exemplo</button>
            </div>
          </div>
        </section>
      </main>
    `;
  }

  function renderAdminTab(poll, votes) {
    if (ui.adminTab === "results") return renderAdminResults(poll, votes);
    if (ui.adminTab === "voters") return renderVotersList(poll, votes);
    return renderPollEditor(poll);
  }

  function emptyDraft() {
    return {
      title: "",
      description: "",
      options: ["", ""],
      is_published: true,
      is_active: true,
      allow_results_view: true,
      lock_at: "",
    };
  }

  function draftFromPoll(poll) {
    if (!poll) return emptyDraft();
    return {
      title: poll.title || "",
      description: poll.description || "",
      options: poll.options?.length ? [...poll.options] : ["", ""],
      is_published: poll.is_published !== false,
      is_active: poll.is_active !== false,
      allow_results_view: poll.allow_results_view !== false,
      lock_at: toDatetimeLocal(poll.lock_at),
    };
  }

  function getCurrentDraft(poll) {
    const key = poll?.id || "new";
    if (!ui.draft || ui.draft.key !== key) {
      ui.draft = { key, ...draftFromPoll(poll) };
    }
    return ui.draft;
  }

  function captureDraftFromDom() {
    const form = document.querySelector("[data-poll-form]");
    if (!form || !ui.draft) return;
    ui.draft.title = form.querySelector("[name='title']")?.value || "";
    ui.draft.description = form.querySelector("[name='description']")?.value || "";
    ui.draft.lock_at = form.querySelector("[name='lock_at']")?.value || "";
    ui.draft.is_published = Boolean(form.querySelector("[name='is_published']")?.checked);
    ui.draft.is_active = Boolean(form.querySelector("[name='is_active']")?.checked);
    ui.draft.allow_results_view = Boolean(form.querySelector("[name='allow_results_view']")?.checked);
    ui.draft.options = [...form.querySelectorAll("[name='option']")].map((input) => input.value);
  }

  function renderPollEditor(poll) {
    const draft = getCurrentDraft(poll);
    const cleanCount = draft.options.filter((option) => option.trim()).length;
    return `
      <form class="form-grid" data-poll-form data-poll-editing="${poll ? escapeHtml(poll.id) : ""}">
        <div class="field">
          <label class="label" for="poll-title">Título da Enquete</label>
          <input class="input" id="poll-title" name="title" value="${escapeHtml(draft.title)}" placeholder="Ex: Qual tema para o próximo evento?" />
        </div>

        <div class="field">
          <label class="label" for="poll-description">Descrição (opcional)</label>
          <textarea class="textarea" id="poll-description" name="description" placeholder="Adicione uma descrição para contextualizar a votação...">${escapeHtml(draft.description)}</textarea>
        </div>

        <div class="field">
          <div class="label">Opções de Voto (${cleanCount})</div>
          <div class="options-editor">
            ${draft.options.map((option, index) => `
              <div class="option-edit-row">
                <span class="option-number">${index + 1}</span>
                <input class="input" name="option" value="${escapeHtml(option)}" placeholder="Opção ${index + 1}" />
                <button type="button" class="icon-btn" title="Remover opção" data-remove-option="${index}" ${draft.options.length <= 2 ? "disabled" : ""}>×</button>
              </div>
            `).join("")}
          </div>
          <button type="button" class="btn outline" data-add-option>+ Adicionar opção</button>
        </div>

        <div class="settings-list">
          ${renderSwitch("is_published", draft.is_published, "green", "👁️", "Enquete visível", "Aparece na página de votação")}
          ${renderSwitch("is_active", draft.is_active, "blue", "🗳️", "Votação aberta", "Usuários podem votar")}
          ${renderSwitch("allow_results_view", draft.allow_results_view, "purple", "📊", "Resultados visíveis", "Usuários podem ver o gráfico")}
        </div>

        <div class="field">
          <label class="label" for="lock-at">Encerrar votação automaticamente (opcional)</label>
          <input class="input" type="datetime-local" id="lock-at" name="lock_at" value="${escapeHtml(draft.lock_at)}" />
          ${draft.lock_at ? `<p class="muted-help">A votação será encerrada em: ${escapeHtml(new Date(draft.lock_at).toLocaleString("pt-BR"))}</p>` : `<p class="muted-help">Funciona enquanto a página for aberta ou recarregada, pois os dados ficam no navegador.</p>`}
        </div>

        <div class="actions-row">
          <button type="submit" class="btn primary" data-save-poll ${!draft.title.trim() || cleanCount < 2 ? "disabled" : ""}>💾 ${poll ? "Atualizar Enquete" : "Criar Enquete"}</button>
          ${poll ? `<button type="button" class="btn outline" data-reset-votes="${escapeHtml(poll.id)}">↻ Zerar Votos</button>` : ""}
          ${poll ? `<button type="button" class="btn danger" data-delete-poll="${escapeHtml(poll.id)}">Excluir Enquete</button>` : ""}
        </div>
      </form>
    `;
  }

  function renderSwitch(name, checked, color, icon, title, text) {
    return `
      <label class="setting-card ${color} ${checked ? "on" : ""}">
        <span class="setting-main">
          <span class="setting-icon">${icon}</span>
          <span class="setting-copy">
            <p>${checked ? title : title.replace("visível", "oculta").replace("aberta", "encerrada").replace("visíveis", "ocultos")}</p>
            <small>${checked ? text : text.replace("Aparece", "Não aparece").replace("Usuários podem votar", "Usuários não podem mais votar").replace("Usuários podem ver o gráfico", "Gráfico oculto para usuários")}</small>
          </span>
        </span>
        <span class="switch">
          <input type="checkbox" name="${name}" ${checked ? "checked" : ""} />
          <span class="slider"></span>
        </span>
      </label>
    `;
  }

  function renderAdminResults(poll, votes) {
    if (!poll) {
      return `<p class="muted-help" style="text-align:center;padding:40px 0;">Crie uma enquete para ver os resultados.</p>`;
    }

    const total = votes.length;
    const data = (poll.options || [])
      .map((option, index) => ({
        option,
        count: votes.filter((vote) => vote.option === option).length,
        color: getColor(option, index),
      }))
      .sort((a, b) => b.count - a.count);
    const topNames = new Set(data.slice(0, 2).map((item) => item.option));

    return `
      <section>
        <div class="admin-results-head">
          <div>
            <h2>${escapeHtml(poll.title)}</h2>
            <p class="muted-help" style="margin-top:4px;">Acompanhamento dos resultados desta enquete.</p>
          </div>
          <span class="badge">${total} voto${total !== 1 ? "s" : ""}</span>
        </div>

        ${total > 0 ? `
          <div class="top-grid">
            ${data.slice(0, 2).map((item, index) => {
              const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return `
                <div class="top-card" style="border-color:${item.color};background:${item.color}16">
                  <span class="top-medal" style="background:${item.color}">${index === 0 ? "🏆" : "2º"}</span>
                  <span style="min-width:0">
                    <p>${escapeHtml(item.option)}</p>
                    <small>${item.count} voto${item.count !== 1 ? "s" : ""} · ${pct}%</small>
                  </span>
                </div>
              `;
            }).join("")}
          </div>
        ` : ""}

        <div class="admin-result-list">
          ${data.map((item) => {
            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
            const isTop = topNames.has(item.option) && total > 0;
            return `
              <div class="admin-chart-row ${isTop ? "top" : ""}">
                <div class="admin-chart-meta">
                  <span class="admin-chart-name"><span class="dot" style="background:${item.color}"></span>${escapeHtml(item.option)}</span>
                  <span class="chart-numbers" style="color:#0f172a"><small style="color:#94a3b8">${item.count}v</small>${pct}%</span>
                </div>
                <div class="admin-progress">
                  <div class="progress-fill" style="width:${pct}%; min-width:${pct > 0 ? "10px" : "0"}; background:${item.color}; box-shadow:${isTop ? `0 0 8px ${item.color}80` : "none"}"></div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderVotersList(poll, votes) {
    if (!poll) {
      return `<p class="muted-help" style="text-align:center;padding:40px 0;">Crie uma enquete para ver os votantes.</p>`;
    }

    if (!votes.length) {
      return `
        <section style="text-align:center;padding:44px 0;">
          <div style="font-size:42px;opacity:.35;margin-bottom:10px;">👥</div>
          <p class="muted-help">Nenhum voto registrado ainda.</p>
        </section>
      `;
    }

    return `
      <section>
        <div class="admin-results-head">
          <div>
            <h2>Detalhes dos Votos</h2>
            <p class="muted-help" style="margin-top:4px;">Votos registrados para ${escapeHtml(poll.title)}.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Votante</th>
                <th>Email local</th>
                <th>Opção</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              ${votes.map((vote) => {
                const index = Math.max(0, poll.options.indexOf(vote.option));
                const badge = OPTION_BADGES[index % OPTION_BADGES.length];
                return `
                  <tr>
                    <td><strong>${escapeHtml(vote.voter_name || "Anônimo")}</strong></td>
                    <td>${escapeHtml(vote.voter_email || "—")}</td>
                    <td><span class="badge" style="background:${badge[0]};color:${badge[1]}">${escapeHtml(vote.option)}</span></td>
                    <td>${escapeHtml(formatDate(vote.updated_date || vote.created_date))}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function render404(route) {
    return `
      <main class="page-404">
        <section>
          <h1>404</h1>
          <h2>Página não encontrada</h2>
          <p>A rota "${escapeHtml(route)}" não existe neste projeto.</p>
          <button class="btn primary" data-go-home>Ir para a votação</button>
        </section>
      </main>
    `;
  }

  function bindEvents() {
    document.querySelectorAll("[data-select-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const pollId = button.getAttribute("data-poll");
        ui.selectedVoteOption[pollId] = button.getAttribute("data-select-option");
        render();
      });
    });

    document.querySelectorAll("[data-confirm-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        const pollId = button.getAttribute("data-confirm-vote");
        voteInPoll(pollId, ui.selectedVoteOption[pollId]);
      });
    });

    document.querySelectorAll("[data-change-vote]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.changingVotes.add(button.getAttribute("data-change-vote"));
        render();
      });
    });

    document.querySelectorAll("[data-cancel-change]").forEach((button) => {
      button.addEventListener("click", () => {
        ui.changingVotes.delete(button.getAttribute("data-cancel-change"));
        render();
      });
    });

    document.querySelectorAll("[data-select-poll]").forEach((button) => {
      button.addEventListener("click", () => {
        captureDraftFromDom();
        ui.selectedPollId = button.getAttribute("data-select-poll");
        ui.draft = null;
        render();
      });
    });

    const newPoll = document.querySelector("[data-new-poll]");
    if (newPoll) {
      newPoll.addEventListener("click", () => {
        captureDraftFromDom();
        ui.selectedPollId = "new";
        ui.draft = null;
        ui.adminTab = "editor";
        render();
      });
    }

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        captureDraftFromDom();
        ui.adminTab = button.getAttribute("data-tab");
        render();
      });
    });

    const form = document.querySelector("[data-poll-form]");
    if (form) {
      form.addEventListener("input", () => {
        captureDraftFromDom();
        updateEditorDomState();
      });
      form.addEventListener("change", () => {
        captureDraftFromDom();
        render();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        captureDraftFromDom();
        const editing = form.getAttribute("data-poll-editing") || null;
        savePollFromDraft(ui.draft, editing);
      });
    }

    const addOption = document.querySelector("[data-add-option]");
    if (addOption) {
      addOption.addEventListener("click", () => {
        captureDraftFromDom();
        ui.draft.options.push("");
        render();
        const options = document.querySelectorAll("[name='option']");
        options[options.length - 1]?.focus();
      });
    }

    document.querySelectorAll("[data-remove-option]").forEach((button) => {
      button.addEventListener("click", () => {
        captureDraftFromDom();
        const index = Number(button.getAttribute("data-remove-option"));
        if (ui.draft.options.length > 2) ui.draft.options.splice(index, 1);
        render();
      });
    });

    document.querySelectorAll("[data-reset-votes]").forEach((button) => {
      button.addEventListener("click", () => resetVotes(button.getAttribute("data-reset-votes")));
    });

    document.querySelectorAll("[data-delete-poll]").forEach((button) => {
      button.addEventListener("click", () => deletePoll(button.getAttribute("data-delete-poll")));
    });

    const exportButton = document.querySelector("[data-export]");
    if (exportButton) exportButton.addEventListener("click", exportData);

    const importInput = document.querySelector("[data-import]");
    if (importInput) importInput.addEventListener("change", (event) => importData(event.target.files?.[0]));

    const resetAll = document.querySelector("[data-reset-all]");
    if (resetAll) resetAll.addEventListener("click", resetAllData);

    const goHome = document.querySelector("[data-go-home]");
    if (goHome) goHome.addEventListener("click", () => setRoute("Vote"));
  }

  function updateEditorDomState() {
    if (!ui.draft) return;
    const button = document.querySelector("[data-save-poll]");
    if (!button) return;
    const cleanCount = ui.draft.options.filter((option) => option.trim()).length;
    button.disabled = !ui.draft.title.trim() || cleanCount < 2;
  }

  function showToast(message) {
    ui.toastMessage = message;
    window.requestAnimationFrame(() => {
      const toast = document.getElementById("toast");
      if (!toast || !ui.toastMessage) return;
      toast.textContent = ui.toastMessage;
      toast.classList.add("show");
      clearTimeout(ui.toastTimer);
      ui.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        ui.toastMessage = "";
      }, 2600);
    });
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) render();
  });
  window.addEventListener("vota-facil:changed", () => {
    // Mantém múltiplas abas da mesma página sincronizadas.
  });

  setInterval(() => {
    const state = loadState();
    if (closeExpiredPolls(state)) {
      saveState(state);
      render();
    }
  }, 5000);

  if (!location.hash) {
    history.replaceState(null, "", "#/Vote");
  }

  render();
})();
