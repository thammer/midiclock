/**
 * midiclock: detect MIDI clock (0xF8) and display BPM per device.
 * Uses Web MIDI API only; no third-party dependencies.
 */

const MIDI_CLOCK = 0xf8;
const PPQ = 24;
const INTERVAL_BUFFER_SIZE = 48;
const BPM_UPDATE_THROTTLE_MS = 150;

interface DeviceState {
  input: MIDIInput;
  lastTimestamp: number;
  intervalBuffer: number[];
  intervalIndex: number;
  intervalCount: number;
  intervalSum: number;
  bpm: number | null;
}

interface DeviceRow {
  container: HTMLLIElement;
  nameEl: HTMLSpanElement;
  bpmEl: HTMLSpanElement;
}

let midiAccess: MIDIAccess | null = null;
const deviceState = new Map<string, DeviceState>();
const deviceRows = new Map<string, DeviceRow>();
const dirtyDeviceIds = new Set<string>();
let rafScheduled = false;
let lastDomUpdate = 0;
let lastStatusMessage = "";
let lastStatusError = false;

const statusEl = document.getElementById("status") as HTMLElement;
const deviceListEl = document.getElementById("device-list") as HTMLUListElement;

function setStatus(message: string, isError = false): void {
  if (!statusEl) return;
  if (message === lastStatusMessage && isError === lastStatusError) return;
  lastStatusMessage = message;
  lastStatusError = isError;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function getOrCreateDeviceState(input: MIDIInput): DeviceState {
  let state = deviceState.get(input.id);
  if (!state) {
    state = {
      input,
      lastTimestamp: 0,
      intervalBuffer: new Array<number>(INTERVAL_BUFFER_SIZE),
      intervalIndex: 0,
      intervalCount: 0,
      intervalSum: 0,
      bpm: null,
    };
    deviceState.set(input.id, state);
  }
  return state;
}

function onMidiMessage(input: MIDIInput, event: MIDIMessageEvent): void {
  const data = event.data;
  if (!data || data.length === 0 || data[0] !== MIDI_CLOCK) return;

  const state = getOrCreateDeviceState(input);
  const now =
    typeof event.timeStamp === "number" && event.timeStamp > 0
      ? event.timeStamp
      : performance.now();

  if (state.lastTimestamp > 0) {
    const delta = now - state.lastTimestamp;
    if (delta > 0 && Number.isFinite(delta)) {
      if (state.intervalCount < INTERVAL_BUFFER_SIZE) {
        state.intervalBuffer[state.intervalIndex] = delta;
        state.intervalSum += delta;
        state.intervalCount += 1;
      } else {
        state.intervalSum -= state.intervalBuffer[state.intervalIndex];
        state.intervalBuffer[state.intervalIndex] = delta;
        state.intervalSum += delta;
      }
      state.intervalIndex = (state.intervalIndex + 1) % INTERVAL_BUFFER_SIZE;
      if (state.intervalCount >= 2) {
        const avg = state.intervalSum / state.intervalCount;
        state.bpm = 60000 / (avg * PPQ);
      }
    }
  }
  state.lastTimestamp = now;
  dirtyDeviceIds.add(input.id);

  scheduleRender();
}

function scheduleRender(): void {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => renderDeviceList());
}

function renderDeviceList(force = false): void {
  if (!deviceListEl) return;
  rafScheduled = false;
  const now = performance.now();
  if (!force && dirtyDeviceIds.size === 0) return;

  if (!force && now - lastDomUpdate < BPM_UPDATE_THROTTLE_MS) {
    rafScheduled = true;
    requestAnimationFrame(() => renderDeviceList());
    return;
  }
  lastDomUpdate = now;

  if (force) {
    const activeIds = new Set(deviceState.keys());
    deviceRows.forEach((_, id) => {
      if (!activeIds.has(id)) removeDeviceRow(id);
    });
    deviceState.forEach((state, id) => {
      ensureDeviceRow(id, state);
      updateDeviceRowBpm(id, state);
    });
    dirtyDeviceIds.clear();
    return;
  }

  dirtyDeviceIds.forEach((id) => {
    const state = deviceState.get(id);
    if (!state) return;
    ensureDeviceRow(id, state);
    updateDeviceRowBpm(id, state);
  });
  dirtyDeviceIds.clear();
}

function ensureDeviceRow(id: string, state: DeviceState): void {
  if (!deviceListEl) return;
  let row = deviceRows.get(id);
  const currentName = state.input.name || state.input.id || "Unnamed device";
  if (!row) {
    const li = document.createElement("li");
    li.className = "device-card";
    const nameSpan = document.createElement("span");
    nameSpan.className = "device-name";
    const bpmSpan = document.createElement("span");
    bpmSpan.className = "device-bpm inactive";
    li.appendChild(nameSpan);
    li.appendChild(bpmSpan);
    deviceListEl.appendChild(li);
    row = { container: li, nameEl: nameSpan, bpmEl: bpmSpan };
    deviceRows.set(id, row);
  }
  if (row.nameEl.textContent !== currentName) {
    row.nameEl.textContent = currentName;
  }
}

function updateDeviceRowBpm(id: string, state: DeviceState): void {
  const row = deviceRows.get(id);
  if (!row) return;
  if (state.bpm != null) {
    row.bpmEl.textContent = state.bpm.toFixed(1) + " BPM";
    row.bpmEl.classList.remove("inactive");
  } else {
    row.bpmEl.textContent = "— BPM";
    row.bpmEl.classList.add("inactive");
  }
}

function removeDeviceRow(id: string): void {
  const row = deviceRows.get(id);
  if (!row) return;
  row.container.remove();
  deviceRows.delete(id);
}

function attachInput(input: MIDIInput): void {
  const state = getOrCreateDeviceState(input);
  if (state.input !== input) {
    state.input.onmidimessage = null;
    state.input = input;
  }
  input.onmidimessage = (event: MIDIMessageEvent) => onMidiMessage(input, event);
}

function detachInput(id: string): void {
  const state = deviceState.get(id);
  if (state?.input) {
    state.input.onmidimessage = null;
  }
  deviceState.delete(id);
  dirtyDeviceIds.delete(id);
  removeDeviceRow(id);
}

function refreshInputs(): void {
  if (!midiAccess) return;
  const currentIds = new Set<string>();
  midiAccess.inputs.forEach((input: MIDIInput, id: string) => {
    // Only treat as connected if port state is actually "connected"
    // (disconnected ports may still appear in inputs in some browsers)
    if (input.state !== "connected") return;
    currentIds.add(id);
    attachInput(input);
  });
  // Remove disconnected devices so the UI list updates immediately
  const idsToRemove: string[] = [];
  deviceState.forEach((_, id) => {
    if (!currentIds.has(id)) idsToRemove.push(id);
  });
  idsToRemove.forEach((id) => detachInput(id));
  renderDeviceList(true);

  const count = currentIds.size;
  if (count === 0) {
    setStatus("No MIDI devices found. Connect a device and refresh.");
  } else {
    setStatus(
      count === 1
        ? "1 MIDI input connected. Send clock to see BPM."
        : `${count} MIDI inputs connected. Send clock to see BPM.`
    );
  }
}

function init(): void {
  if (!("requestMIDIAccess" in navigator)) {
    setStatus("Web MIDI API is not supported in this browser.", true);
    return;
  }

  navigator.requestMIDIAccess!()
    .then((access: MIDIAccess) => {
      midiAccess = access;
      midiAccess.onstatechange = refreshInputs;
      refreshInputs();
    })
    .catch((err: unknown) => {
      setStatus(
        "Could not access MIDI: " + (err instanceof Error ? err.message : String(err)),
        true
      );
    });
}

init();
