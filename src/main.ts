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
  intervals: number[];
  bpm: number | null;
  pendingUpdate: boolean;
}

let midiAccess: MIDIAccess | null = null;
const deviceState = new Map<string, DeviceState>();
let rafScheduled = false;
let lastDomUpdate = 0;

const statusEl = document.getElementById("status") as HTMLElement;
const deviceListEl = document.getElementById("device-list") as HTMLUListElement;

function setStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function getOrCreateDeviceState(input: MIDIInput): DeviceState {
  let state = deviceState.get(input.id);
  if (!state) {
    state = {
      input,
      lastTimestamp: 0,
      intervals: [],
      bpm: null,
      pendingUpdate: false,
    };
    deviceState.set(input.id, state);
  }
  return state;
}

function onMidiMessage(input: MIDIInput, event: MIDIMessageEvent): void {
  const data = event.data;
  if (!data || data.length === 0 || data[0] !== MIDI_CLOCK) return;

  const state = getOrCreateDeviceState(input);
  const now = performance.now();

  if (state.lastTimestamp > 0) {
    const delta = now - state.lastTimestamp;
    state.intervals.push(delta);
    if (state.intervals.length > INTERVAL_BUFFER_SIZE) {
      state.intervals.shift();
    }
    if (state.intervals.length >= 2) {
      const avg =
        state.intervals.reduce((a, b) => a + b, 0) / state.intervals.length;
      state.bpm = 60000 / (avg * PPQ);
    }
  }
  state.lastTimestamp = now;
  state.pendingUpdate = true;

  scheduleRender();
}

function scheduleRender(): void {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => renderDeviceList());
}

function renderDeviceList(force = false): void {
  rafScheduled = false;
  const now = performance.now();
  let hasPending = false;
  deviceState.forEach((state) => {
    if (state.pendingUpdate) hasPending = true;
  });
  if (!hasPending && !force) return;

  if (!force && now - lastDomUpdate < BPM_UPDATE_THROTTLE_MS) {
    rafScheduled = true;
    requestAnimationFrame(() => renderDeviceList());
    return;
  }
  lastDomUpdate = now;
  deviceState.forEach((state) => {
    state.pendingUpdate = false;
  });

  if (!deviceListEl) return;

  deviceListEl.innerHTML = "";
  deviceState.forEach((state) => {
    const li = document.createElement("li");
    li.className = "device-card";
    const nameSpan = document.createElement("span");
    nameSpan.className = "device-name";
    nameSpan.textContent = state.input.name || state.input.id || "Unnamed device";
    const bpmSpan = document.createElement("span");
    bpmSpan.className = "device-bpm";
    if (state.bpm != null) {
      bpmSpan.textContent = state.bpm.toFixed(1) + " BPM";
    } else {
      bpmSpan.textContent = "— BPM";
      bpmSpan.classList.add("inactive");
    }
    li.appendChild(nameSpan);
    li.appendChild(bpmSpan);
    deviceListEl.appendChild(li);
  });
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
