const core = window.SchedulerCore;

const state = {
  processes: core.cloneProcesses(core.sampleProcesses),
};

const processTableBody = document.querySelector("#processTableBody");
const processCountLabel = document.querySelector("#processCountLabel");
const addProcessButton = document.querySelector("#addProcessButton");
const runButton = document.querySelector("#runButton");
const resetButton = document.querySelector("#resetButton");
const loadSampleButton = document.querySelector("#loadSampleButton");
const printButton = document.querySelector("#printButton");
const algorithmSelect = document.querySelector("#algorithmSelect");
const quantumInput = document.querySelector("#quantumInput");
const messageArea = document.querySelector("#messageArea");
const summaryArea = document.querySelector("#summaryArea");
const resultsArea = document.querySelector("#resultsArea");

const colors = [
  "#176b87",
  "#2f855a",
  "#b7791f",
  "#b42318",
  "#6b46c1",
  "#0f766e",
  "#9f1239",
  "#4b5563",
  "#2563eb",
  "#7c2d12",
];

function renderProcessTable() {
  processTableBody.innerHTML = "";
  state.processes.forEach((process, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>P${index + 1}</td>
      <td><input data-field="arrival" data-index="${index}" type="number" min="0" step="1" value="${process.arrival}"></td>
      <td><input data-field="burst" data-index="${index}" type="number" min="1" step="1" value="${process.burst}"></td>
      <td><input data-field="priority" data-index="${index}" type="number" min="1" step="1" value="${process.priority}"></td>
      <td><button class="delete-button" data-delete="${index}" type="button" aria-label="Remove P${index + 1}">x</button></td>
    `;
    processTableBody.appendChild(row);
  });
  updateProcessLabels();
}

function updateProcessLabels() {
  const count = state.processes.length;
  processCountLabel.textContent = `${count} ${count === 1 ? "process" : "processes"}`;
  addProcessButton.disabled = count >= 10;
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.disabled = count <= 3;
  });
}

function readProcesses() {
  const rows = Array.from(processTableBody.querySelectorAll("tr"));
  return rows.map((row, index) => {
    const inputs = row.querySelectorAll("input");
    return {
      id: `P${index + 1}`,
      arrival: Number(inputs[0].value),
      burst: Number(inputs[1].value),
      priority: Number(inputs[2].value),
    };
  });
}

function syncStateFromTable() {
  state.processes = readProcesses();
}

function showMessage(text, isError = false) {
  messageArea.textContent = text;
  messageArea.classList.toggle("error", isError);
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function colorForProcess(id) {
  if (id === "Idle") return "var(--idle)";
  const number = Number(String(id).replace(/\D/g, ""));
  return colors[(number - 1 + colors.length) % colors.length];
}

function renderSummary(results) {
  if (results.length <= 1) {
    summaryArea.innerHTML = "";
    return;
  }
  const best = results.reduce((winner, result) => {
    return result.averageWaiting < winner.averageWaiting ? result : winner;
  }, results[0]);
  summaryArea.innerHTML = `
    <div class="summary-block">
      <h3>Comparison Summary</h3>
      <div class="table-wrap">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Avg Waiting</th>
              <th>Avg Turnaround</th>
              <th>Completion</th>
              <th>Switches</th>
            </tr>
          </thead>
          <tbody>
            ${results
              .map(
                (result) => `
                <tr>
                  <td>${result.algorithmName}${result.algorithmId === best.algorithmId ? " *" : ""}</td>
                  <td>${formatNumber(result.averageWaiting)}</td>
                  <td>${formatNumber(result.averageTurnaround)}</td>
                  <td>${result.totalCompletionTime}</td>
                  <td>${result.contextSwitches}</td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderResultCard(result) {
  const card = document.createElement("article");
  card.className = "result-card";
  card.innerHTML = `
    <div class="result-head">
      <div>
        <h3>${result.algorithmName}</h3>
      </div>
    </div>
    <div class="metric-strip">
      <div class="metric"><span>Average Waiting</span><strong>${formatNumber(result.averageWaiting)}</strong></div>
      <div class="metric"><span>Average Turnaround</span><strong>${formatNumber(result.averageTurnaround)}</strong></div>
      <div class="metric"><span>Completion Time</span><strong>${result.totalCompletionTime}</strong></div>
      <div class="metric"><span>Context Switches</span><strong>${result.contextSwitches}</strong></div>
    </div>
    <div class="gantt-wrap">
      <div class="gantt">
        ${result.segments
          .map(
            (segment) => `
            <div class="gantt-segment ${segment.id === "Idle" ? "idle" : ""}"
                 style="flex-grow:${segment.duration}; --segment-color:${colorForProcess(segment.id)}">
              <span>${segment.id}</span>
              <small>${segment.start}-${segment.end}</small>
            </div>
          `
          )
          .join("")}
      </div>
    </div>
    <div class="table-wrap metrics-table">
      <table>
        <thead>
          <tr>
            <th>Process</th>
            <th>Arrival</th>
            <th>Burst</th>
            <th>Priority</th>
            <th>Completion</th>
            <th>Turnaround</th>
            <th>Waiting</th>
          </tr>
        </thead>
        <tbody>
          ${result.rows
            .map(
              (row) => `
              <tr>
                <td>${row.id}</td>
                <td>${row.arrival}</td>
                <td>${row.burst}</td>
                <td>${row.priority}</td>
                <td>${row.completion}</td>
                <td>${row.turnaround}</td>
                <td>${row.waiting}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  return card;
}

function renderResults(results) {
  summaryArea.innerHTML = "";
  resultsArea.innerHTML = "";
  if (!results.length) {
    resultsArea.innerHTML = `<div class="empty-state">No simulation output.</div>`;
    return;
  }
  renderSummary(results);
  results.forEach((result) => {
    resultsArea.appendChild(renderResultCard(result));
  });
}

function runSimulation() {
  syncStateFromTable();
  const errors = core.validateProcesses(state.processes);
  const quantum = Number(quantumInput.value);
  if (!Number.isInteger(quantum) || quantum <= 0) {
    errors.push("Round Robin quantum must be a whole number above 0.");
  }
  if (errors.length) {
    showMessage(errors[0], true);
    renderResults([]);
    return;
  }

  const selected = algorithmSelect.value;
  const results = selected === "all"
    ? core.simulateAll(state.processes, quantum)
    : [core.simulate(state.processes, selected, quantum)];
  renderResults(results);
  showMessage("Simulation completed.");
}

function addProcess() {
  syncStateFromTable();
  if (state.processes.length >= 10) return;
  const next = state.processes.length + 1;
  state.processes.push({ id: `P${next}`, arrival: next - 1, burst: 4, priority: next });
  renderProcessTable();
  showMessage("Process added.");
}

function resetProcesses() {
  state.processes = [
    { id: "P1", arrival: 0, burst: 5, priority: 2 },
    { id: "P2", arrival: 1, burst: 3, priority: 1 },
    { id: "P3", arrival: 2, burst: 6, priority: 3 },
  ];
  renderProcessTable();
  renderResults([]);
  showMessage("Input reset.");
}

function loadSample() {
  state.processes = core.cloneProcesses(core.sampleProcesses);
  quantumInput.value = "3";
  algorithmSelect.value = "all";
  renderProcessTable();
  runSimulation();
}

processTableBody.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  const index = Number(event.target.dataset.index);
  if (!field || Number.isNaN(index)) return;
  state.processes[index][field] = Number(event.target.value);
});

processTableBody.addEventListener("click", (event) => {
  const index = Number(event.target.dataset.delete);
  if (Number.isNaN(index) || state.processes.length <= 3) return;
  syncStateFromTable();
  state.processes.splice(index, 1);
  state.processes = state.processes.map((process, processIndex) => ({
    ...process,
    id: `P${processIndex + 1}`,
  }));
  renderProcessTable();
  showMessage("Process removed.");
});

addProcessButton.addEventListener("click", addProcess);
runButton.addEventListener("click", runSimulation);
resetButton.addEventListener("click", resetProcesses);
loadSampleButton.addEventListener("click", loadSample);
printButton.addEventListener("click", () => window.print());
algorithmSelect.addEventListener("change", runSimulation);
quantumInput.addEventListener("change", runSimulation);

renderProcessTable();
runSimulation();
