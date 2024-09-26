// ================== Configuration ==================
// Replace with your actual authorization token
const AUTH_TOKEN = 'API-KEY-HERE';

// API Endpoints
const API_URL = 'https://us.api.bland.ai/v1/calls';
const EVENT_STREAM_URL = 'https://us.api.bland.ai/v1/event_stream/';
const CALL_DETAILS_URL = 'https://us.api.bland.ai/v1/calls/';

// Fixed voice setting (remove voice selection from HTML)
const VOICE = 'Public - ravi52b82d13-7484-4157-8111-b25cad64279e'; // Replace with your desired voice ID

// ================== Event Listeners ==================
document.getElementById('uploadExcel').addEventListener('change', handleFile, false);
document.getElementById('startCalls').addEventListener('click', initiateCalls, false);
document.getElementById('downloadLogs').addEventListener('click', downloadCallLogs, false);

// ================== Global Variables ==================
let excelData = []; // To store the parsed Excel data
let callStatusMap = {}; // To track call statuses and related data
let totalCalls = 0;
let completedCalls = 0;

// ================== File Handling ==================
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    excelData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    displayTable(excelData);

    document.getElementById('startCalls').disabled = false; // Enable the Start Calls button
  };
  reader.readAsArrayBuffer(file);
}

// ================== Table Display ==================
function displayTable(data) {
  let table = '<table><thead><tr>';
  const headers = data[0];
  headers.forEach(header => {
    table += `<th>${header}</th>`;
  });
  table += '<th>Call Status</th><th>Action</th></tr></thead><tbody>';

  // Start from index 1 to skip headers
  for (let i = 1; i < data.length; i++) {
    table += '<tr>';
    data[i].forEach(cell => {
      table += `<td>${cell ? cell : ''}</td>`;
    });
    table += `<td id="status-${i}" class="status-pending">Pending</td>`;
    table += `<td id="action-${i}"></td></tr>`;
  }

  table += '</tbody></table>';
  document.querySelector('.excel-preview').innerHTML = table;
}

// ================== Phone Number Formatting ==================
function formatPhoneNumber(number) {
  // Convert the number to a string in case it's not
  let phone = number.toString().trim();

  // Remove all '+' signs to prevent duplication
  phone = phone.replace(/\+/g, '');

  // Check if the remaining number has at least 10 digits
  const digitCount = phone.replace(/\D/g, '').length;
  if (digitCount < 10) {
    return null; // Invalid phone number
  }

  // Prepend a single '+' sign
  return `+${phone}`;
}

// ================== Initiate Calls ==================
async function initiateCalls() {
  const startButton = document.getElementById('startCalls');
  startButton.textContent = 'Processing...';
  startButton.disabled = true; // Prevent multiple clicks

  document.getElementById('progress-container').style.display = 'block';
  totalCalls = excelData.length - 1; // Excluding header
  completedCalls = 0;
  updateProgress();

  for (let i = 1; i < excelData.length; i++) {
    const row = excelData[i];
    const name = row[0]; // Assuming Name is the first column
    let phoneNumber = row[1]; // Assuming Phone Number is the second column
    const goal = row[2]; // Assuming Goal is the third column
    const context = row[3]; // Assuming Context is the fourth column

    if (phoneNumber) {
      // Format the phone number
      phoneNumber = formatPhoneNumber(phoneNumber);

      if (!phoneNumber) {
        updateStatus(i, 'Invalid Phone Number', 'status-missed');
        updateAction(i, ''); // No action
        incrementCompletedCalls();
        continue; // Skip to the next iteration
      }

      try {
        updateStatus(i, 'Calling...', 'status-calling');
        const response = await makeCall(name, phoneNumber, goal, context);
        if (response.status === 'success') {
          const callId = response.call_id;
          // Store call details for polling
          callStatusMap[callId] = {
            rowIndex: i,
            status: 'calling',
            recordingUrl: null
          };
          updateStatus(i, 'Call Initiated', 'status-initiated');
          // Start polling for call status
          pollCallStatus(callId);
        } else {
          updateStatus(i, `Failed: ${response.message || 'Unknown Error'}`, 'status-missed');
          updateAction(i, '');
          incrementCompletedCalls();
        }
      } catch (error) {
        console.error('Error making call:', error);
        updateStatus(i, `Error: ${error.message}`, 'status-missed');
        updateAction(i, '');
        incrementCompletedCalls();
      }
    } else {
      updateStatus(i, 'No Phone Number', 'status-missed');
      updateAction(i, '');
      incrementCompletedCalls();
    }
  }
}

// ================== Update Progress ==================
function updateProgress() {
  const progressPercentage = totalCalls === 0 ? 0 : (completedCalls / totalCalls) * 100;
  document.getElementById('callProgress').value = progressPercentage;
  document.getElementById('progress-text').textContent = `${Math.round(progressPercentage)}%`;
}

function incrementCompletedCalls() {
  completedCalls++;
  updateProgress();
  if (completedCalls === totalCalls) {
    document.getElementById('downloadLogs').disabled = false;
    const startButton = document.getElementById('startCalls');
    startButton.textContent = 'Start Session';
    startButton.disabled = false;
  }
}

// ================== Update Status ==================
function updateStatus(rowIndex, status, className = '') {
  const statusCell = document.getElementById(`status-${rowIndex}`);
  if (statusCell) {
    if (status === 'Calling...' || status === 'Ringing...' || status === 'Answered') {
      statusCell.innerHTML = `${status} <span class="spinner"></span>`;
    } else {
      statusCell.textContent = status;
    }
    statusCell.className = className;
  }
}

// ================== Update Action ==================
function updateAction(rowIndex, content) {
  const actionCell = document.getElementById(`action-${rowIndex}`);
  if (actionCell) {
    actionCell.innerHTML = content;
  }
}

// ================== Make Call ==================
async function makeCall(name, phoneNumber, goal, context) {
  const payload = {
    phone_number: phoneNumber,
    // Removed 'from' to let the API choose a random number
    task: `Name: ${name}\nContext: ${context}\nGoal: ${goal}\n\n*speak only in Hindi*\n*Action: END CALL WITHOUT USER INPUT*\n\nNamaste, ${name}. I am calling from KreditBee - To avoid paying heavy late fees and saving credit scores for future needs - please pay your invoice before tomorrow. Thanks - Have a good day, BYE!!!\n\n[After delivering this message, end the call immediately without waiting for a response.]`,
    model: "base",
    language: "hi",
    language_detection_period: 20, // in seconds
    language_detection_options: ["hi", "en"],
    voice: VOICE,
    voice_settings: {},
    pathway_id: null,
    local_dialing: false,
    max_duration: 20, // 20 seconds
    answered_by_enabled: false,
    wait_for_greeting: false,
    record: true,
    amd: false,
    interruption_threshold: 100,
    voicemail_message: "",
    temperature: 0.5,
    transfer_phone_number: null,
    transfer_list: {},
    metadata: {},
    pronunciation_guide: [],
    start_time: null,
    request_data: {},
    tools: [],
    dynamic_data: [],
    analysis_preset: null,
    analysis_schema: {},
    webhook: null,
    calendly: {}
  };

  try {
    const response = await axios.post(API_URL, payload, {
      headers: {
        'Authorization': AUTH_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    // Handle specific API errors here if needed
    throw new Error(error.response?.data?.message || error.message);
  }
}

// ================== Poll Call Status ==================
async function pollCallStatus(callId) {
  const pollingInterval = 5000; // 5 seconds
  const maxAttempts = 60; // Poll for up to 5 minutes
  let attempts = 0;

  const intervalId = setInterval(async () => {
    attempts++;
    try {
      // Fetch event stream for the call
      const events = await getEventStream(callId);
      handleEvents(callId, events);

      // Fetch call details to check if completed
      const callDetails = await getCallDetails(callId);
      if (callDetails.completed) {
        clearInterval(intervalId);
        processCallEnd(callId, callDetails);
      }
    } catch (error) {
      console.error(`Error polling call status for ${callId}:`, error);
      clearInterval(intervalId);
      const rowIndex = callStatusMap[callId]?.rowIndex;
      if (rowIndex !== undefined) {
        updateStatus(rowIndex, `Polling Error: ${error.message}`, 'status-missed');
        updateAction(rowIndex, '');
        incrementCompletedCalls();
      }
    }

    if (attempts >= maxAttempts) {
      clearInterval(intervalId);
      const rowIndex = callStatusMap[callId]?.rowIndex;
      if (rowIndex !== undefined) {
        updateStatus(rowIndex, 'Polling Timeout', 'status-missed');
        updateAction(rowIndex, '');
        incrementCompletedCalls();
      }
    }
  }, pollingInterval);
}

// ================== Get Event Stream ==================
async function getEventStream(callId) {
  const url = `${EVENT_STREAM_URL}${callId}`;
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': AUTH_TOKEN
      }
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch event stream: ${response.statusText}`);
    }

    const data = response.data;
    return data.event_stream_data; // Return the array of events
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message);
  }
}

// ================== Handle Events ==================
function handleEvents(callId, events) {
  const rowIndex = callStatusMap[callId]?.rowIndex;
  if (!rowIndex) return;

  events.forEach(event => {
    if (event.category === 'info') {
      const message = event.message.toLowerCase();
      if (message.includes('ringing')) {
        updateStatus(rowIndex, 'Ringing...', 'status-calling');
      } else if (message.includes('call connected') || message.includes('answered')) {
        updateStatus(rowIndex, 'Answered', 'status-talked');
      } else if (message.includes('missed')) {
        updateStatus(rowIndex, 'Missed', 'status-missed');
      }
    } else if (event.category === 'error') {
      updateStatus(rowIndex, `Error: ${event.message}`, 'status-missed');
    }
  });
}

// ================== Get Call Details ==================
async function getCallDetails(callId) {
  const url = `${CALL_DETAILS_URL}${callId}`;
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': AUTH_TOKEN
      }
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch call details: ${response.statusText}`);
    }

    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || error.message);
  }
}

// ================== Process Call End ==================
function processCallEnd(callId, callDetails) {
  const rowIndex = callStatusMap[callId]?.rowIndex;
  if (rowIndex === undefined) return;

  let finalStatus = 'Ended';
  let statusClass = 'status-ended';
  let actionContent = '';

  // Determine if the call was answered based on recording_url presence
  if (callDetails.recording_url) {
    finalStatus = 'Talked';
    statusClass = 'status-talked';
    actionContent = `<a href="${callDetails.recording_url}" target="_blank" class="download-link">Download Recording</a>`;
  } else if (callDetails.answered_by === 'missed') {
    finalStatus = 'Missed';
    statusClass = 'status-missed';
  } else {
    finalStatus = 'Ended';
  }

  updateStatus(rowIndex, finalStatus, statusClass);
  updateAction(rowIndex, actionContent);
  incrementCompletedCalls();
}

// ================== Download Call Logs ==================
function downloadCallLogs() {
  const headers = ["Name", "Phone Number", "Goal", "Context", "Call Status", "Action"];
  const rows = [headers];

  for (let i = 1; i < excelData.length; i++) {
    const row = [...excelData[i]];
    const status = document.getElementById(`status-${i}`).textContent;
    const actionHTML = document.getElementById(`action-${i}`).innerHTML;
    // Extract text from HTML (e.g., remove <a> tags)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = actionHTML;
    const actionText = tempDiv.textContent || tempDiv.innerText || '';
    rows.push([...row, status, actionText]);
  }

  let csvContent = "data:text/csv;charset=utf-8," 
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "call_logs.csv");
  document.body.appendChild(link); // Required for FF

  link.click();
  document.body.removeChild(link);
}

// ================== Security Reminder ==================
/*
  IMPORTANT SECURITY NOTE:
  Exposing your AUTH_TOKEN in client-side JavaScript is a significant security risk.
  It's highly recommended to handle API interactions on a secure backend server to protect your authorization tokens and sensitive data.
  Consider implementing a backend proxy that securely communicates with the AI call APIs.
}

// ================== Include Axios Library ==================
// Ensure that Axios is included in your HTML before this script
// <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
