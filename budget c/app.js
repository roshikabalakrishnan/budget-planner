/* Budget Planner Pro - vanilla JS, localStorage, animations */

const STORAGE_KEY = "budget-planner-pro:v1";

const DEFAULT_STATE = {
  currency: "INR",
  locale: "en-IN",
  selectedMonth: null, // "YYYY-MM"
  tx: [],
  budgets: [],
  goals: [],
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function monthKeyFromDate(dateStr) {
  // expects "YYYY-MM-DD"
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.slice(0, 7);
}

function toISODateLocal(d = new Date()) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthLocal(d = new Date()) {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function fmtMoney(amount, state) {
  const num = Number(amount || 0);
  try {
    return new Intl.NumberFormat(state.locale, {
      style: "currency",
      currency: state.currency,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `₹${num.toFixed(2)}`;
  }
}

function parseAmount(v) {
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeJsonParse(raw) : null;
  const state = parsed && typeof parsed === "object" ? parsed : structuredClone(DEFAULT_STATE);
  if (!state.selectedMonth) state.selectedMonth = toMonthLocal();
  state.tx ??= [];
  state.budgets ??= [];
  state.goals ??= [];
  return state;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(title, msg = "") {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toast__title"></div>
    <div class="toast__msg"></div>
    <div class="toast__bar" aria-hidden="true"></div>
  `;
  el.querySelector(".toast__title").textContent = title;
  el.querySelector(".toast__msg").textContent = msg;
  wrap.appendChild(el);
  window.setTimeout(() => {
    el.style.transition = "opacity .2s ease, transform .2s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    window.setTimeout(() => el.remove(), 240);
  }, 3200);
}

function openModal({ title, subtitle, bodyEl, primaryLabel = "Save", onSubmit }) {
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const modalBody = document.getElementById("modalBody");
  const modalPrimary = document.getElementById("modalPrimary");
  const form = document.getElementById("modalForm");

  modalTitle.textContent = title;
  modalSubtitle.textContent = subtitle || "";
  modalBody.innerHTML = "";
  modalBody.appendChild(bodyEl);
  modalPrimary.textContent = primaryLabel;

  const handler = (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    const isCancel = submitter?.value === "cancel";
    if (isCancel) {
      modal.close();
      cleanup();
      return;
    }
    const ok = onSubmit?.();
    if (ok !== false) {
      modal.close();
      cleanup();
    }
  };

  function cleanup() {
    form.removeEventListener("submit", handler);
  }

  form.addEventListener("submit", handler);
  modal.showModal();
}

function buildField({ label, id, type = "text", value = "", placeholder = "", options = null, span2 = false, step }) {
  const wrap = document.createElement("div");
  wrap.className = `field${span2 ? " span-2" : ""}`;

  const l = document.createElement("label");
  l.className = "field__label";
  l.setAttribute("for", id);
  l.textContent = label;
  wrap.appendChild(l);

  let input;
  if (options) {
    input = document.createElement("select");
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      input.appendChild(o);
    }
    input.value = value;
  } else {
    input = document.createElement("input");
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    if (step) input.step = String(step);
  }
  input.id = id;
  input.autocomplete = "off";
  wrap.appendChild(input);

  return { wrap, input };
}

function pickEmojiForCategory(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("food") || c.includes("grocer") || c.includes("restaurant")) return "🍔";
  if (c.includes("rent") || c.includes("house") || c.includes("home")) return "🏠";
  if (c.includes("travel") || c.includes("uber") || c.includes("fuel") || c.includes("transport")) return "🚕";
  if (c.includes("shopping") || c.includes("cloth")) return "🛍️";
  if (c.includes("health") || c.includes("medical")) return "🩺";
  if (c.includes("phone") || c.includes("internet")) return "📶";
  if (c.includes("salary") || c.includes("job")) return "💼";
  if (c.includes("gift")) return "🎁";
  if (c.includes("entertain") || c.includes("movie") || c.includes("game")) return "🎮";
  if (c.includes("save") || c.includes("goal")) return "🎯";
  return "💠";
}

function getMonthLabel(monthKey, state) {
  if (!monthKey) return "This month";
  const [y, m] = monthKey.split("-").map((x) => Number(x));
  const d = new Date(y, (m || 1) - 1, 1);
  const isThisMonth = monthKey === toMonthLocal();
  const pretty = d.toLocaleDateString(state.locale, { month: "long", year: "numeric" });
  return isThisMonth ? `This month · ${pretty}` : pretty;
}

function sumTx(tx, type = null) {
  return tx.reduce((acc, t) => {
    if (type && t.type !== type) return acc;
    return acc + Number(t.amount || 0);
  }, 0);
}

function monthTx(state, monthKey) {
  return state.tx.filter((t) => monthKeyFromDate(t.date) === monthKey);
}

function budgetsForMonth(state, monthKey) {
  return state.budgets.filter((b) => (b.monthKey || state.selectedMonth) === monthKey);
}

function goalsTotalSaved(state) {
  return state.goals.reduce((a, g) => a + Number(g.saved || 0), 0);
}

function init() {
  const state = loadState();
  attachUI(state);
  renderAll(state);
  animateOnScroll();
}

function attachUI(state) {
  // Tabs
  const tabs = Array.from(document.querySelectorAll(".tab"));
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.toggle("is-active", x === t));
      const key = t.dataset.tab;
      document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === key));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Month selector
  const txMonth = document.getElementById("txMonth");
  txMonth.value = state.selectedMonth;
  txMonth.addEventListener("change", () => {
    state.selectedMonth = txMonth.value || toMonthLocal();
    saveState(state);
    renderAll(state);
    toast("Month updated", getMonthLabel(state.selectedMonth, state));
  });

  // Transactions controls
  document.getElementById("txSearch").addEventListener("input", () => renderTransactions(state));
  document.getElementById("txSort").addEventListener("change", () => renderTransactions(state));

  document.querySelectorAll(".seg__btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".seg__btn").forEach((x) => x.classList.toggle("is-active", x === b));
      renderTransactions(state);
    });
  });

  // Buttons
  document.getElementById("btnAddTx").addEventListener("click", () => openTxModal(state));
  document.getElementById("btnQuickAdd").addEventListener("click", () => openTxModal(state, { quick: true }));
  document.getElementById("btnAddExpense").addEventListener("click", () => openTxModal(state, { type: "expense" }));

  const openBudget = () => openBudgetModal(state);
  document.getElementById("btnAddBudget").addEventListener("click", openBudget);
  document.getElementById("btnAddBudget2").addEventListener("click", openBudget);

  const openGoal = () => openGoalModal(state);
  document.getElementById("btnAddGoal").addEventListener("click", openGoal);
  document.getElementById("btnAddGoal2").addEventListener("click", openGoal);

  document.getElementById("btnReset").addEventListener("click", () => {
    openConfirmModal({
      title: "Reset everything?",
      message: "This will remove transactions, budgets, and goals from this device.",
      danger: true,
      onConfirm: () => {
        localStorage.removeItem(STORAGE_KEY);
        const next = loadState();
        Object.assign(state, next);
        attachMonthLabel(state);
        renderAll(state);
        toast("Reset done", "All data cleared.");
      },
    });
  });

  document.getElementById("btnDemo").addEventListener("click", () => {
    const demo = buildDemoState(state);
    Object.assign(state, demo);
    saveState(state);
    attachMonthLabel(state);
    renderAll(state);
    toast("Demo data added", "Explore tabs and try editing items.");
  });

  document.getElementById("btnExport").addEventListener("click", () => exportData(state));

  attachMonthLabel(state);
}

function attachMonthLabel(state) {
  document.getElementById("monthLabel").textContent = getMonthLabel(state.selectedMonth, state);
  const txMonth = document.getElementById("txMonth");
  if (txMonth) txMonth.value = state.selectedMonth;
}

function openConfirmModal({ title, message, danger = false, onConfirm }) {
  const body = document.createElement("div");
  body.className = "help";
  body.textContent = message;
  openModal({
    title,
    subtitle: danger ? "This action cannot be undone." : "",
    bodyEl: body,
    primaryLabel: danger ? "Yes, reset" : "Confirm",
    onSubmit: () => {
      onConfirm?.();
      return true;
    },
  });
}

function openTxModal(state, opts = {}) {
  const isEdit = !!opts.txId;
  const tx = isEdit ? state.tx.find((t) => t.id === opts.txId) : null;

  const body = document.createElement("div");
  body.className = "form-grid";

  const date = buildField({
    label: "Date",
    id: "f_date",
    type: "date",
    value: tx?.date || toISODateLocal(),
  });

  const title = buildField({
    label: "Title",
    id: "f_title",
    value: tx?.title || (opts.quick ? "New transaction" : ""),
    placeholder: "e.g., Salary / Groceries / Rent",
  });

  const type = buildField({
    label: "Type",
    id: "f_type",
    value: tx?.type || opts.type || "expense",
    options: [
      { value: "expense", label: "Expense" },
      { value: "income", label: "Income" },
    ],
  });

  const category = buildField({
    label: "Category",
    id: "f_cat",
    value: tx?.category || (opts.type === "expense" ? "Food" : "Salary"),
    placeholder: "e.g., Food, Rent, Travel",
  });

  const amount = buildField({
    label: "Amount",
    id: "f_amount",
    type: "number",
    value: String(tx?.amount ?? (opts.type === "expense" ? 0 : 0)),
    placeholder: "0",
    step: "0.01",
  });

  const note = buildField({
    label: "Note (optional)",
    id: "f_note",
    value: tx?.note || "",
    placeholder: "Anything to remember…",
    span2: true,
  });

  [date, title, type, category, amount, note].forEach((f) => body.appendChild(f.wrap));

  const help = document.createElement("div");
  help.className = "help span-2";
  help.textContent = "Tip: Use Budgets tab to set monthly limits and see usage on Dashboard.";
  body.appendChild(help);

  openModal({
    title: isEdit ? "Edit transaction" : "Add transaction",
    subtitle: isEdit ? "Update the details" : "Track income and expenses",
    primaryLabel: isEdit ? "Update" : "Add",
    bodyEl: body,
    onSubmit: () => {
      const next = {
        id: tx?.id || uid("tx"),
        date: date.input.value || toISODateLocal(),
        title: title.input.value.trim() || "Untitled",
        type: type.input.value,
        category: category.input.value.trim() || "General",
        amount: parseAmount(amount.input.value),
        note: note.input.value.trim(),
      };
      if (next.amount <= 0) {
        toast("Amount required", "Please enter a value greater than 0.");
        amount.input.focus();
        return false;
      }
      if (isEdit) {
        state.tx = state.tx.map((t) => (t.id === tx.id ? next : t));
        toast("Updated", "Transaction updated.");
      } else {
        state.tx = [next, ...state.tx];
        toast("Added", "Transaction added.");
      }
      saveState(state);
      renderAll(state);
      return true;
    },
  });
}

function openBudgetModal(state, opts = {}) {
  const isEdit = !!opts.budgetId;
  const b = isEdit ? state.budgets.find((x) => x.id === opts.budgetId) : null;
  const monthKey = state.selectedMonth;

  const body = document.createElement("div");
  body.className = "form-grid";

  const cat = buildField({
    label: "Category",
    id: "b_cat",
    value: b?.category || "",
    placeholder: "e.g., Food, Rent, Travel",
    span2: true,
  });

  const limit = buildField({
    label: "Monthly limit",
    id: "b_limit",
    type: "number",
    value: String(b?.limit ?? 0),
    step: "0.01",
  });

  const m = buildField({
    label: "Month",
    id: "b_month",
    type: "month",
    value: b?.monthKey || monthKey,
  });

  body.appendChild(cat.wrap);
  body.appendChild(limit.wrap);
  body.appendChild(m.wrap);

  const help = document.createElement("div");
  help.className = "help span-2";
  help.textContent = "Budgets are per-month. Dashboard shows usage for the selected month.";
  body.appendChild(help);

  openModal({
    title: isEdit ? "Edit budget category" : "Add budget category",
    subtitle: isEdit ? "Update limit and month" : "Set a monthly limit per category",
    primaryLabel: isEdit ? "Update" : "Add",
    bodyEl: body,
    onSubmit: () => {
      const next = {
        id: b?.id || uid("bud"),
        monthKey: m.input.value || state.selectedMonth,
        category: cat.input.value.trim() || "General",
        limit: parseAmount(limit.input.value),
      };
      if (next.limit <= 0) {
        toast("Limit required", "Please enter a limit greater than 0.");
        limit.input.focus();
        return false;
      }
      if (isEdit) {
        state.budgets = state.budgets.map((x) => (x.id === b.id ? next : x));
        toast("Updated", "Budget updated.");
      } else {
        state.budgets = [next, ...state.budgets];
        toast("Added", "Budget category added.");
      }
      saveState(state);
      renderAll(state);
      return true;
    },
  });
}

function openGoalModal(state, opts = {}) {
  const isEdit = !!opts.goalId;
  const g = isEdit ? state.goals.find((x) => x.id === opts.goalId) : null;

  const body = document.createElement("div");
  body.className = "form-grid";

  const name = buildField({
    label: "Goal name",
    id: "g_name",
    value: g?.name || "",
    placeholder: "e.g., Emergency Fund / New Laptop",
    span2: true,
  });

  const target = buildField({
    label: "Target amount",
    id: "g_target",
    type: "number",
    value: String(g?.target ?? 0),
    step: "0.01",
  });

  const saved = buildField({
    label: "Already saved",
    id: "g_saved",
    type: "number",
    value: String(g?.saved ?? 0),
    step: "0.01",
  });

  body.appendChild(name.wrap);
  body.appendChild(target.wrap);
  body.appendChild(saved.wrap);

  const help = document.createElement("div");
  help.className = "help span-2";
  help.textContent = "You can contribute anytime from the Goals tab after creating a goal.";
  body.appendChild(help);

  openModal({
    title: isEdit ? "Edit savings goal" : "Add savings goal",
    subtitle: isEdit ? "Update progress and target" : "Track savings for any goal",
    primaryLabel: isEdit ? "Update" : "Add",
    bodyEl: body,
    onSubmit: () => {
      const next = {
        id: g?.id || uid("goal"),
        name: name.input.value.trim() || "Untitled goal",
        target: parseAmount(target.input.value),
        saved: parseAmount(saved.input.value),
      };
      if (next.target <= 0) {
        toast("Target required", "Please enter a target greater than 0.");
        target.input.focus();
        return false;
      }
      next.saved = clamp(next.saved, 0, next.target);

      if (isEdit) {
        state.goals = state.goals.map((x) => (x.id === g.id ? next : x));
        toast("Updated", "Goal updated.");
      } else {
        state.goals = [next, ...state.goals];
        toast("Added", "Goal created.");
      }
      saveState(state);
      renderAll(state);
      return true;
    },
  });
}

function contributeToGoal(state, goalId) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return;

  const body = document.createElement("div");
  body.className = "form-grid";

  const amt = buildField({
    label: "Contribution",
    id: "c_amt",
    type: "number",
    value: "0",
    step: "0.01",
    span2: true,
  });
  body.appendChild(amt.wrap);

  const help = document.createElement("div");
  help.className = "help span-2";
  help.textContent = `Remaining: ${fmtMoney(Math.max(0, g.target - g.saved), state)}`;
  body.appendChild(help);

  openModal({
    title: "Contribute to goal",
    subtitle: g.name,
    primaryLabel: "Add contribution",
    bodyEl: body,
    onSubmit: () => {
      const a = parseAmount(amt.input.value);
      if (a <= 0) {
        toast("Amount required", "Enter a value greater than 0.");
        return false;
      }
      g.saved = clamp(Number(g.saved) + a, 0, g.target);
      saveState(state);
      renderAll(state);
      toast("Saved!", `${fmtMoney(a, state)} added to ${g.name}.`);
      return true;
    },
  });
}

function deleteItem(state, kind, id) {
  if (kind === "tx") state.tx = state.tx.filter((t) => t.id !== id);
  if (kind === "budget") state.budgets = state.budgets.filter((b) => b.id !== id);
  if (kind === "goal") state.goals = state.goals.filter((g) => g.id !== id);
  saveState(state);
  renderAll(state);
}

function renderAll(state) {
  attachMonthLabel(state);
  renderMetrics(state);
  renderBudgetsDashboard(state);
  renderTopSpending(state);
  renderGoalsDashboard(state);
  renderTransactions(state);
  renderBudgetsTab(state);
  renderGoalsTab(state);
}

function renderMetrics(state) {
  const income = sumTx(state.tx, "income");
  const expenses = sumTx(state.tx, "expense");
  const balance = income - expenses;
  const saved = goalsTotalSaved(state);

  document.getElementById("metricIncome").textContent = fmtMoney(income, state);
  document.getElementById("metricExpenses").textContent = fmtMoney(expenses, state);
  document.getElementById("metricBalance").textContent = fmtMoney(balance, state);
  document.getElementById("metricSavings").textContent = fmtMoney(saved, state);

  const hint = document.getElementById("metricBalanceHint");
  hint.textContent = balance >= 0 ? "Positive balance" : "Overspent";

  document.getElementById("sparkIncome").style.setProperty("--w", "1");
  document.getElementById("sparkExpenses").style.setProperty("--w", "1");
  document.getElementById("sparkBalance").style.setProperty("--w", "1");
  document.getElementById("sparkSavings").style.setProperty("--w", "1");
}

function computeBudgetUsage(state, monthKey) {
  const monthExpenses = monthTx(state, monthKey).filter((t) => t.type === "expense");
  const budgets = budgetsForMonth(state, monthKey);

  const totalLimit = budgets.reduce((a, b) => a + Number(b.limit || 0), 0);
  const totalSpent = monthExpenses.reduce((a, t) => a + Number(t.amount || 0), 0);
  const pct = totalLimit > 0 ? clamp((totalSpent / totalLimit) * 100, 0, 140) : 0;
  return { totalLimit, totalSpent, pct, budgets, monthExpenses };
}

function setDonutPct(pct) {
  const circle = document.getElementById("donutValue");
  const r = 46;
  const c = 2 * Math.PI * r; // ~289
  const clamped = clamp(pct, 0, 100);
  const offset = c - (clamped / 100) * c;
  circle.style.strokeDasharray = `${c.toFixed(0)}`;
  circle.style.strokeDashoffset = `${offset}`;
  document.getElementById("budgetUsedPct").textContent = `${Math.round(clamped)}%`;
}

function renderBudgetsDashboard(state) {
  const monthKey = state.selectedMonth;
  const { budgets, monthExpenses, pct } = computeBudgetUsage(state, monthKey);

  setDonutPct(pct);

  const byCat = new Map();
  for (const t of monthExpenses) {
    const key = (t.category || "General").trim();
    byCat.set(key, (byCat.get(key) || 0) + Number(t.amount || 0));
  }

  const list = document.getElementById("budgetList");
  list.innerHTML = "";

  if (budgets.length === 0) {
    list.appendChild(buildEmptyInline("Add budget categories to track monthly limits."));
    return;
  }

  for (const b of budgets.slice().sort((a, z) => z.limit - a.limit)) {
    const spent = byCat.get(b.category) || 0;
    const p = b.limit > 0 ? clamp((spent / b.limit) * 100, 0, 140) : 0;
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="li-left">
        <div class="pill" aria-hidden="true">${pickEmojiForCategory(b.category)}</div>
        <div style="min-width:0">
          <div class="li-title"></div>
          <div class="li-sub"></div>
          <div class="progress" style="margin-top:8px">
            <div class="progress__bar"></div>
          </div>
        </div>
      </div>
      <div class="li-meta">
        <div class="li-amt"></div>
        <div class="li-mini"></div>
      </div>
    `;
    item.querySelector(".li-title").textContent = b.category;
    item.querySelector(".li-sub").textContent = `${fmtMoney(spent, state)} spent of ${fmtMoney(b.limit, state)}`;
    item.querySelector(".li-amt").textContent = `${Math.round(p)}%`;
    item.querySelector(".li-mini").textContent = p > 100 ? "Over limit" : "Within limit";
    const bar = item.querySelector(".progress__bar");
    bar.style.width = `${clamp(p, 0, 100)}%`;
    bar.style.background =
      p > 100
        ? "linear-gradient(90deg, rgba(239,68,68,1), rgba(245,158,11,1))"
        : "linear-gradient(90deg, var(--accent), var(--accent2))";

    item.addEventListener("click", () => openBudgetModal(state, { budgetId: b.id }));
    list.appendChild(item);
  }
}

function buildEmptyInline(text) {
  const el = document.createElement("div");
  el.className = "list-item";
  el.innerHTML = `
    <div class="li-left">
      <div class="pill" aria-hidden="true">✨</div>
      <div>
        <div class="li-title">Nothing here yet</div>
        <div class="li-sub"></div>
      </div>
    </div>
  `;
  el.querySelector(".li-sub").textContent = text;
  return el;
}

function renderTopSpending(state) {
  const monthKey = state.selectedMonth;
  const expenses = monthTx(state, monthKey).filter((t) => t.type === "expense");

  const byCat = new Map();
  for (const t of expenses) byCat.set(t.category || "General", (byCat.get(t.category || "General") || 0) + t.amount);

  const entries = Array.from(byCat.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const list = document.getElementById("topSpendingList");
  list.innerHTML = "";
  if (entries.length === 0) {
    list.appendChild(buildEmptyInline("Add expenses to see your top categories."));
  } else {
    for (const e of entries) {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <div class="li-left">
          <div class="pill" aria-hidden="true">${pickEmojiForCategory(e.category)}</div>
          <div style="min-width:0">
            <div class="li-title"></div>
            <div class="li-sub">This month</div>
          </div>
        </div>
        <div class="li-meta">
          <div class="li-amt"></div>
          <div class="li-mini">Expense</div>
        </div>
      `;
      item.querySelector(".li-title").textContent = e.category;
      item.querySelector(".li-amt").textContent = fmtMoney(e.amount, state);
      list.appendChild(item);
    }
  }

  drawSpendingChart(state, entries);
}

function drawSpendingChart(state, entries) {
  const canvas = document.getElementById("spendChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 560;
  const cssH = Math.round(cssW * (180 / 560));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, cssW, cssH);

  // background grid
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(100,116,139,.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = (cssH * i) / 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }

  if (!entries.length) {
    ctx.fillStyle = "rgba(100,116,139,.8)";
    ctx.font = "600 12px Inter, system-ui, sans-serif";
    ctx.fillText("No spending data for this month", 10, 20);
    return;
  }

  const max = Math.max(...entries.map((e) => e.amount), 1);
  const pad = 12;
  const barW = (cssW - pad * 2) / entries.length;
  const baseY = cssH - 18;
  const maxH = cssH - 44;

  // animate
  const start = performance.now();
  const duration = 520;

  const grad = ctx.createLinearGradient(0, 0, cssW, cssH);
  grad.addColorStop(0, "rgba(77,107,255,0.95)");
  grad.addColorStop(1, "rgba(168,85,247,0.95)");

  function frame(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.clearRect(0, 0, cssW, cssH);

    // grid
    ctx.strokeStyle = "rgba(100,116,139,.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = (cssH * i) / 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    ctx.fillStyle = grad;
    entries.forEach((e, i) => {
      const h = (e.amount / max) * maxH * ease;
      const x = pad + i * barW + 8;
      const y = baseY - h;
      const w = Math.max(14, barW - 16);
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();

      ctx.fillStyle = "rgba(15,23,42,.72)";
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      const short = e.category.length > 10 ? `${e.category.slice(0, 10)}…` : e.category;
      ctx.fillText(short, x, cssH - 6);
      ctx.fillStyle = grad;
    });

    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function renderGoalsDashboard(state) {
  const list = document.getElementById("goalsProgressList");
  list.innerHTML = "";
  if (!state.goals.length) {
    list.appendChild(buildEmptyInline("Add a goal to track progress on the dashboard."));
    return;
  }

  for (const g of state.goals.slice().sort((a, b) => b.target - a.target).slice(0, 5)) {
    const pct = g.target > 0 ? clamp((g.saved / g.target) * 100, 0, 100) : 0;
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="li-left">
        <div class="pill" aria-hidden="true">🎯</div>
        <div style="min-width:0">
          <div class="li-title"></div>
          <div class="li-sub"></div>
          <div class="progress" style="margin-top:8px">
            <div class="progress__bar"></div>
          </div>
        </div>
      </div>
      <div class="li-meta">
        <div class="li-amt"></div>
        <div class="li-mini"></div>
      </div>
    `;
    item.querySelector(".li-title").textContent = g.name;
    item.querySelector(".li-sub").textContent = `${fmtMoney(g.saved, state)} of ${fmtMoney(g.target, state)}`;
    item.querySelector(".li-amt").textContent = `${Math.round(pct)}%`;
    item.querySelector(".li-mini").textContent = pct >= 100 ? "Completed" : "In progress";
    item.querySelector(".progress__bar").style.width = `${pct}%`;

    item.addEventListener("click", () => contributeToGoal(state, g.id));
    list.appendChild(item);
  }
}

function getTxFilterType() {
  const active = document.querySelector(".seg__btn.is-active");
  return active?.dataset?.filter || "all";
}

function renderTransactions(state) {
  const tbody = document.getElementById("txTableBody");
  const empty = document.getElementById("txEmpty");
  const q = document.getElementById("txSearch").value.trim().toLowerCase();
  const sort = document.getElementById("txSort").value;
  const monthKey = state.selectedMonth;
  const filterType = getTxFilterType();

  let rows = monthTx(state, monthKey);
  if (filterType !== "all") rows = rows.filter((t) => t.type === filterType);
  if (q) {
    rows = rows.filter((t) => {
      const hay = `${t.title} ${t.category} ${t.note || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  rows = rows.slice();
  rows.sort((a, b) => {
    if (sort === "date_desc") return b.date.localeCompare(a.date);
    if (sort === "date_asc") return a.date.localeCompare(b.date);
    if (sort === "amount_desc") return (b.amount || 0) - (a.amount || 0);
    if (sort === "amount_asc") return (a.amount || 0) - (b.amount || 0);
    return 0;
  });

  tbody.innerHTML = "";
  if (!rows.length) {
    empty.classList.add("is-visible");
    return;
  }
  empty.classList.remove("is-visible");

  for (const t of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td></td>
      <td></td>
      <td></td>
      <td class="align-right"></td>
      <td class="align-right"></td>
    `;
    tr.children[0].textContent = new Date(t.date).toLocaleDateString(state.locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    tr.children[1].textContent = t.title;
    tr.children[2].textContent = t.category;
    const amt = document.createElement("span");
    amt.className = `amt ${t.type === "income" ? "is-income" : "is-expense"}`;
    amt.textContent = `${t.type === "income" ? "+" : "-"}${fmtMoney(Math.abs(t.amount), state)}`;
    tr.children[3].appendChild(amt);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.type = "button";
    edit.title = "Edit";
    edit.textContent = "✎";
    edit.addEventListener("click", () => openTxModal(state, { txId: t.id }));

    const del = document.createElement("button");
    del.className = "icon-btn icon-btn--danger";
    del.type = "button";
    del.title = "Delete";
    del.textContent = "🗑";
    del.addEventListener("click", () => {
      openConfirmModal({
        title: "Delete transaction?",
        message: `"${t.title}" will be removed.`,
        danger: true,
        onConfirm: () => {
          deleteItem(state, "tx", t.id);
          toast("Deleted", "Transaction removed.");
        },
      });
    });

    actions.appendChild(edit);
    actions.appendChild(del);
    tr.children[4].appendChild(actions);

    tbody.appendChild(tr);
  }
}

function renderBudgetsTab(state) {
  const grid = document.getElementById("budgetsGrid");
  const empty = document.getElementById("budgetsEmpty");
  grid.innerHTML = "";
  const monthKey = state.selectedMonth;

  const budgets = budgetsForMonth(state, monthKey).slice().sort((a, b) => b.limit - a.limit);
  if (!budgets.length) {
    empty.classList.add("is-visible");
    return;
  }
  empty.classList.remove("is-visible");

  const expenses = monthTx(state, monthKey).filter((t) => t.type === "expense");
  const byCat = new Map();
  for (const t of expenses) byCat.set(t.category || "General", (byCat.get(t.category || "General") || 0) + t.amount);

  for (const b of budgets) {
    const spent = byCat.get(b.category) || 0;
    const pct = b.limit > 0 ? clamp((spent / b.limit) * 100, 0, 140) : 0;
    const card = document.createElement("div");
    card.className = "mini";
    card.innerHTML = `
      <div class="mini__top">
        <div>
          <div class="mini__title"></div>
          <div class="mini__sub"></div>
        </div>
        <div class="mini__amt"></div>
      </div>
      <div class="mini__bar">
        <div class="progress">
          <div class="progress__bar"></div>
        </div>
      </div>
      <div class="mini__actions"></div>
    `;
    card.querySelector(".mini__title").textContent = `${pickEmojiForCategory(b.category)} ${b.category}`;
    card.querySelector(".mini__sub").textContent = getMonthLabel(b.monthKey, state);
    card.querySelector(".mini__amt").textContent = `${Math.round(pct)}%`;
    const bar = card.querySelector(".progress__bar");
    bar.style.width = `${clamp(pct, 0, 100)}%`;
    bar.style.background =
      pct > 100
        ? "linear-gradient(90deg, rgba(239,68,68,1), rgba(245,158,11,1))"
        : "linear-gradient(90deg, var(--accent), var(--accent2))";

    const actions = card.querySelector(".mini__actions");
    const edit = document.createElement("button");
    edit.className = "btn btn--ghost btn--sm";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openBudgetModal(state, { budgetId: b.id }));

    const del = document.createElement("button");
    del.className = "btn btn--danger btn--sm";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      openConfirmModal({
        title: "Delete budget category?",
        message: `${b.category} (${getMonthLabel(b.monthKey, state)}) will be removed.`,
        danger: true,
        onConfirm: () => {
          deleteItem(state, "budget", b.id);
          toast("Deleted", "Budget removed.");
        },
      });
    });
    actions.appendChild(edit);
    actions.appendChild(del);

    grid.appendChild(card);
  }
}

function renderGoalsTab(state) {
  const grid = document.getElementById("goalsGrid");
  const empty = document.getElementById("goalsEmpty");
  grid.innerHTML = "";
  if (!state.goals.length) {
    empty.classList.add("is-visible");
    return;
  }
  empty.classList.remove("is-visible");

  for (const g of state.goals.slice().sort((a, b) => b.target - a.target)) {
    const pct = g.target > 0 ? clamp((g.saved / g.target) * 100, 0, 100) : 0;
    const card = document.createElement("div");
    card.className = "mini";
    card.innerHTML = `
      <div class="mini__top">
        <div>
          <div class="mini__title"></div>
          <div class="mini__sub"></div>
        </div>
        <div class="mini__amt"></div>
      </div>
      <div class="mini__bar">
        <div class="progress">
          <div class="progress__bar"></div>
        </div>
      </div>
      <div class="mini__actions"></div>
    `;
    card.querySelector(".mini__title").textContent = `🎯 ${g.name}`;
    card.querySelector(".mini__sub").textContent = `${fmtMoney(g.saved, state)} of ${fmtMoney(g.target, state)}`;
    card.querySelector(".mini__amt").textContent = `${Math.round(pct)}%`;
    card.querySelector(".progress__bar").style.width = `${pct}%`;

    const actions = card.querySelector(".mini__actions");
    const contribute = document.createElement("button");
    contribute.className = "btn btn--primary btn--sm";
    contribute.type = "button";
    contribute.textContent = "+ Contribute";
    contribute.addEventListener("click", () => contributeToGoal(state, g.id));

    const edit = document.createElement("button");
    edit.className = "btn btn--ghost btn--sm";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => openGoalModal(state, { goalId: g.id }));

    const del = document.createElement("button");
    del.className = "btn btn--danger btn--sm";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      openConfirmModal({
        title: "Delete savings goal?",
        message: `"${g.name}" will be removed.`,
        danger: true,
        onConfirm: () => {
          deleteItem(state, "goal", g.id);
          toast("Deleted", "Goal removed.");
        },
      });
    });

    actions.appendChild(contribute);
    actions.appendChild(edit);
    actions.appendChild(del);
    grid.appendChild(card);
  }
}

function exportData(state) {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "Budget Planner Pro (vanilla)",
    data: state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-planner-pro-export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported", "Downloaded JSON backup.");
}

function buildDemoState(state) {
  const monthKey = state.selectedMonth || toMonthLocal();
  const now = new Date();
  const d = (offset) => {
    const dd = new Date(now);
    dd.setDate(dd.getDate() - offset);
    return toISODateLocal(dd);
  };

  const demoTx = [
    { id: uid("tx"), date: d(1), title: "Groceries", type: "expense", category: "Food", amount: 1250, note: "" },
    { id: uid("tx"), date: d(2), title: "Fuel", type: "expense", category: "Transport", amount: 700, note: "" },
    { id: uid("tx"), date: d(3), title: "Internet bill", type: "expense", category: "Internet", amount: 799, note: "" },
    { id: uid("tx"), date: d(4), title: "Movie", type: "expense", category: "Entertainment", amount: 450, note: "" },
    { id: uid("tx"), date: d(6), title: "Salary", type: "income", category: "Salary", amount: 50000, note: "" },
    { id: uid("tx"), date: d(8), title: "Coffee", type: "expense", category: "Food", amount: 220, note: "" },
    { id: uid("tx"), date: d(10), title: "Shopping", type: "expense", category: "Shopping", amount: 2200, note: "" },
  ].map((t) => ({ ...t, date: monthKeyFromDate(t.date) === monthKey ? t.date : `${monthKey}-0${(Math.random() * 9 + 1) | 0}` }));

  const demoBudgets = [
    { id: uid("bud"), monthKey, category: "Food", limit: 9000 },
    { id: uid("bud"), monthKey, category: "Transport", limit: 3000 },
    { id: uid("bud"), monthKey, category: "Entertainment", limit: 2000 },
    { id: uid("bud"), monthKey, category: "Shopping", limit: 5000 },
    { id: uid("bud"), monthKey, category: "Internet", limit: 1200 },
  ];

  const demoGoals = [
    { id: uid("goal"), name: "Emergency Fund", target: 100000, saved: 24000 },
    { id: uid("goal"), name: "New Phone", target: 40000, saved: 8500 },
  ];

  return {
    ...state,
    selectedMonth: monthKey,
    tx: [...demoTx, ...state.tx],
    budgets: [...demoBudgets, ...state.budgets],
    goals: [...demoGoals, ...state.goals],
  };
}

function animateOnScroll() {
  const els = document.querySelectorAll("[data-animate]");
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.style.animationDelay = `${Math.random() * 120}ms`;
          e.target.classList.add("is-animated");
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.08 }
  );
  els.forEach((el) => io.observe(el));
}

window.addEventListener("resize", () => {
  // redraw chart on resize
  const state = loadState();
  renderTopSpending(state);
});

document.addEventListener("DOMContentLoaded", init);

