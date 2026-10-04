const presets = {
  study: {
    focus: "study",
    horizon: "90",
    location: "墨尔本",
    event: "正在两种学习路径之间选择，希望兼顾基础能力与一个可展示的 AI 项目。"
  },
  project: {
    focus: "project",
    horizon: "180",
    location: "墨尔本",
    event: "一个新项目进入原型阶段，需要判断应该先扩大功能，还是先验证最关键的用户假设。"
  },
  team: {
    focus: "team",
    horizon: "30",
    location: "墨尔本",
    event: "团队分工已经确定，但沟通节奏不一致，希望找到下一个最值得协调的节点。"
  }
};

const focusNames = {
  study: "学习与研究",
  project: "项目与创造",
  team: "团队与协作"
};

const stateLabels = {
  opportunity: "机会窗口",
  resistance: "推进阻力",
  resources: "可用资源",
  clarity: "信息清晰度"
};

const form = document.querySelector("#simulation-form");
const resultPanel = document.querySelector(".result-panel");
const runButton = document.querySelector("#run-button");
const runStatus = document.querySelector("#run-status");
const statusDot = document.querySelector(".status-dot");
const eventInput = document.querySelector("#event");
const charCount = document.querySelector("#char-count");
let latestResult = null;

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(value, min = 12, max = 92) {
  return Math.max(min, Math.min(max, value));
}

function getInput() {
  return {
    date: document.querySelector("#birth-date").value,
    time: document.querySelector("#birth-time").value,
    location: document.querySelector("#location").value.trim(),
    focus: document.querySelector("#focus").value,
    horizonDays: Number(document.querySelector("#horizon").value),
    knownEvent: eventInput.value.trim()
  };
}

function deriveWorld(input) {
  const seed = stableHash(JSON.stringify(input));
  const date = new Date(`${input.date}T${input.time || "00:00"}`);
  const month = date.getMonth() + 1;
  const hourBranch = Math.floor(date.getHours() / 2) % 12;
  const palaceIndex = (date.getFullYear() + month * 2 + date.getDate() + hourBranch) % 12;
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const eventSignal = Math.min(input.knownEvent.length, 80);
  const focusBias = input.focus === "study" ? 7 : input.focus === "project" ? 3 : -1;

  const state = {
    opportunity: clamp(48 + (seed % 24) + focusBias),
    resistance: clamp(31 + ((seed >> 4) % 31) + (input.horizonDays > 90 ? 6 : 0)),
    resources: clamp(42 + ((seed >> 8) % 28) + Math.round(eventSignal / 16)),
    clarity: clamp(37 + ((seed >> 12) % 27) + (input.knownEvent.length > 48 ? 8 : 0))
  };

  const rhythm = state.clarity >= 61
    ? "信息渐明，可小步展开"
    : state.resistance > state.opportunity
      ? "先校准，再推进"
      : "先收敛，后展开";

  const rules = [
    {
      id: "CAL-01",
      title: "生成演示历法索引",
      detail: `由公历输入和时段映射得到 ${branches[palaceIndex]} 位索引。此步骤不是传统农历排盘。`
    },
    {
      id: "CTX-02",
      title: "注入主题上下文",
      detail: `${focusNames[input.focus]}主题为机会值加入 ${focusBias >= 0 ? "+" : ""}${focusBias} 的演示权重。`
    },
    {
      id: "EVT-03",
      title: "把已知事件写入状态",
      detail: `检测到 ${input.knownEvent.length} 个字符的现实信息，提升资源与清晰度，而不把文本当作命理事实。`
    },
    {
      id: "SIM-04",
      title: "合并状态并生成节律",
      detail: `比较机会 ${state.opportunity}、阻力 ${state.resistance} 与清晰度 ${state.clarity}，得到“${rhythm}”。`
    }
  ];

  const strongest = Object.entries(state).sort((a, b) => b[1] - a[1])[0];
  const weakest = Object.entries(state).sort((a, b) => a[1] - b[1])[0];
  const confidence = Math.round((state.clarity * .55 + Math.min(input.knownEvent.length, 60) * .45));

  const scenarios = [
    {
      tag: "BASELINE · 基准",
      title: rhythm,
      body: `在未来 ${input.horizonDays} 天内，更合理的做法是先保留一个主路径，并用短周期反馈决定是否扩大投入。`,
      evidence: `${stateLabels[strongest[0]]}是当前最高状态（${strongest[1]}）；依据规则 SIM-04。`
    },
    {
      tag: "UPSIDE · 上行",
      title: "证据形成闭环",
      body: `如果能把“${input.knownEvent.slice(0, 24)}${input.knownEvent.length > 24 ? "…" : ""}”拆成一次可观察的验证，资源可更快转化为进展。`,
      evidence: `资源 ${state.resources} / 清晰度 ${state.clarity}；这是条件情景，不是事件预言。`
    },
    {
      tag: "RISK · 风险",
      title: "过早扩大范围",
      body: `若在信息仍不完整时同时推进多个方向，${stateLabels[weakest[0]]}可能成为瓶颈，造成对结果的过度解释。`,
      evidence: `${stateLabels[weakest[0]]}为最低状态（${weakest[1]}）；需用现实反馈检验。`
    }
  ];

  return {
    meta: {
      model: "ziwei-world-model-demo",
      version: "0.1",
      generatedAt: new Date().toISOString(),
      epistemicStatus: "cultural-rule prototype; not scientifically validated"
    },
    input,
    ruleLayer: {
      calendarIndex: { branch: branches[palaceIndex], index: palaceIndex + 1, isTraditionalChart: false },
      rhythm,
      rules,
      worldState: state
    },
    aiLayer: {
      permission: "interpret_existing_state_only",
      confidence: Math.min(confidence, 78),
      scenarios,
      nextObservation: `在接下来 7 天记录一个与“${focusNames[input.focus]}”直接相关的可观测结果；若它与基准情景相反，就降低该情景权重并重新推演。`
    }
  };
}

function renderResult(result) {
  latestResult = result;
  const { ruleLayer, aiLayer } = result;
  document.querySelector("#palace-index").textContent = `${ruleLayer.calendarIndex.branch} · ${String(ruleLayer.calendarIndex.index).padStart(2, "0")}`;
  document.querySelector("#rhythm-state").textContent = ruleLayer.rhythm;
  document.querySelector("#rule-coverage").textContent = `${ruleLayer.rules.length} / 6`;
  document.querySelector("#state-version").textContent = `STATE · T${Math.floor(Date.now() / 1000).toString().slice(-2)}`;
  document.querySelector("#hero-state").textContent = ruleLayer.rhythm.slice(0, 6);
  document.querySelector("#state-change").textContent = `已将“${result.input.knownEvent.slice(0, 28)}${result.input.knownEvent.length > 28 ? "…" : ""}”编码为上下文证据。`;

  document.querySelector("#rule-trace").innerHTML = ruleLayer.rules.map(rule => `
    <li>
      <strong>${rule.title}<code>${rule.id}</code></strong>
      <p>${rule.detail}</p>
    </li>
  `).join("");

  document.querySelector("#state-bars").innerHTML = Object.entries(ruleLayer.worldState).map(([key, value]) => `
    <div class="state-bar">
      <div class="state-bar-head"><span>${stateLabels[key]}</span><b>${value}</b></div>
      <div class="bar-track"><div class="bar-fill" data-width="${value}"></div></div>
    </div>
  `).join("");
  requestAnimationFrame(() => {
    document.querySelectorAll(".bar-fill").forEach(bar => { bar.style.width = `${bar.dataset.width}%`; });
  });

  document.querySelector("#scenario-grid").innerHTML = aiLayer.scenarios.map(item => `
    <article class="scenario-card">
      <span class="scenario-tag">${item.tag}</span>
      <h3>${item.title}</h3>
      <p>${String(item.body).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))}</p>
      <div class="scenario-evidence"><span>引用状态</span><p>${item.evidence}</p></div>
    </article>
  `).join("");
  document.querySelector("#next-observation").textContent = aiLayer.nextObservation;
}

function setLayer(layer) {
  document.querySelectorAll(".layer-tab").forEach(tab => {
    const active = tab.dataset.layer === layer;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  ["rule", "ai"].forEach(name => {
    const panel = document.querySelector(`#${name}-layer`);
    const active = name === layer;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

function animateArchitecture() {
  const nodes = [...document.querySelectorAll(".flow-node")];
  nodes.forEach(node => node.classList.remove("active"));
  nodes.forEach((node, index) => {
    window.setTimeout(() => node.classList.add("active"), 160 * index);
    window.setTimeout(() => node.classList.remove("active"), 160 * index + 650);
  });
}

document.querySelectorAll(".preset").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".preset").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const preset = presets[button.dataset.preset];
    document.querySelector("#focus").value = preset.focus;
    document.querySelector("#horizon").value = preset.horizon;
    document.querySelector("#location").value = preset.location;
    eventInput.value = preset.event;
    charCount.textContent = eventInput.value.length;
  });
});

document.querySelectorAll(".layer-tab").forEach(tab => {
  tab.addEventListener("click", () => setLayer(tab.dataset.layer));
});

eventInput.addEventListener("input", () => {
  charCount.textContent = eventInput.value.length;
});

form.addEventListener("submit", event => {
  event.preventDefault();
  const input = getInput();
  if (!input.location || !input.knownEvent) return;

  resultPanel.setAttribute("aria-busy", "true");
  runButton.classList.add("running");
  statusDot.classList.add("running");
  runStatus.textContent = "正在构造世界状态…";

  window.setTimeout(() => {
    const result = deriveWorld(input);
    renderResult(result);
    setLayer("rule");
    resultPanel.setAttribute("aria-busy", "false");
    runButton.classList.remove("running");
    statusDot.classList.remove("running");
    runStatus.textContent = `推演完成 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    animateArchitecture();
  }, 520);
});

document.querySelector("#copy-json").addEventListener("click", async () => {
  if (!latestResult) latestResult = deriveWorld(getInput());
  const payload = JSON.stringify(latestResult, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    const area = document.createElement("textarea");
    area.value = payload;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const toast = document.querySelector("#toast");
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 1800);
});

charCount.textContent = eventInput.value.length;
renderResult(deriveWorld(getInput()));

window.ZiweiLab = { deriveWorld, getInput, setLayer };
