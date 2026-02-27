// Google Apps Script Code
function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'update_status') {
    return updateStatus(e);
  }
  
  if (action === 'get_online_devices') {
    return getOnlineDevices(e);
  }
  
  if (action === 'send_message') {
    return sendMessage(e);
  }
  
  if (action === 'get_messages') {
    return getMessages(e);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Invalid action'
  })).setMimeType(ContentService.MimeType.JSON);
}

function updateStatus(e) {
  const deviceId = e.parameter.deviceId;
  const userName = e.parameter.userName;
  const status = e.parameter.status;
  const timestamp = parseInt(e.parameter.timestamp);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('devices');
  
  if (!sheet) {
    sheet = ss.insertSheet('devices');
    sheet.appendRow(['deviceId', 'userName', 'status', 'lastSeen']);
  }
  
  const data = sheet.getDataRange().getValues();
  let found = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === deviceId) {
      sheet.getRange(i + 1, 3).setValue(status);
      sheet.getRange(i + 1, 4).setValue(timestamp);
      found = true;
      break;
    }
  }
  
  if (!found) {
    sheet.appendRow([deviceId, userName, status, timestamp]);
  }
  
  // ลบอุปกรณ์ที่ offline นานเกิน 5 นาที
  const fiveMinutesAgo = Date.now() - 300000;
  for (let i = data.length - 1; i >= 1; i--) {
    const lastSeen = data[i][3];
    if (lastSeen && lastSeen < fiveMinutesAgo) {
      sheet.deleteRow(i + 1);
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success'
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOnlineDevices(e) {
  const currentDevice = e.parameter.currentDevice;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('devices');
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      devices: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues();
  const devices = [];
  const now = Date.now();
  
  for (let i = 1; i < data.length; i++) {
    const deviceId = data[i][0];
    if (deviceId === currentDevice) continue;
    
    const status = data[i][2];
    const lastSeen = data[i][3];
    
    if (status === 'online' && lastSeen && (now - lastSeen) < 60000) {
      devices.push({
        deviceId: deviceId,
        userName: data[i][1],
        lastSeen: lastSeen
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    devices: devices
  })).setMimeType(ContentService.MimeType.JSON);
}

function sendMessage(e) {
  const deviceId = e.parameter.deviceId;
  const userName = e.parameter.userName;
  const type = e.parameter.type;
  const data = e.parameter.data;
  const timestamp = parseInt(e.parameter.timestamp);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('messages');
  
  if (!sheet) {
    sheet = ss.insertSheet('messages');
    sheet.appendRow(['id', 'deviceId', 'userName', 'type', 'data', 'timestamp']);
  }
  
  const messageId = 'msg_' + timestamp + '_' + Math.random().toString(36).substr(2, 5);
  sheet.appendRow([messageId, deviceId, userName, type, data, timestamp]);
  
  // เก็บไว้แค่ 100 ข้อความล่าสุด
  const lastRow = sheet.getLastRow();
  if (lastRow > 100) {
    sheet.deleteRow(2);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    messageId: messageId
  })).setMimeType(ContentService.MimeType.JSON);
}

function getMessages(e) {
  const deviceId = e.parameter.deviceId;
  const lastId = parseInt(e.parameter.lastId) || 0;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('messages');
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      messages: []
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  const data = sheet.getDataRange().getValues();
  const messages = [];
  
  for (let i = 1; i < data.length; i++) {
    const msgId = data[i][0];
    const msgDeviceId = data[i][1];
    const timestamp = data[i][5];
    
    // ไม่ส่งข้อความของตัวเองกลับ
    if (msgDeviceId === deviceId) continue;
    
    if (timestamp > lastId) {
      messages.push({
        id: msgId,
        deviceId: msgDeviceId,
        userName: data[i][2],
        type: data[i][3],
        data: data[i][4],
        timestamp: timestamp
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    messages: messages
  })).setMimeType(ContentService.MimeType.JSON);
}
