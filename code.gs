const PROCESSED_LABEL_NAME = 'Processed';
const CLOUD_FUNCTION_URL = PropertiesService.getScriptProperties().getProperty('CLOUD_FUNCTION_URL')
const METROBANK_PASSWORD = PropertiesService.getScriptProperties().getProperty('METROBANK_PASSWORD')
const CREDENTIALS_FILE_ID = PropertiesService.getScriptProperties().getProperty('CREDENTIALS_FILE_ID')

function main() {
  const threads = GmailApp.search('from:MSOA@metrobankcard.com subject:"metrobank credit card msoa" has:attachment filename:pdf');
  const processedLabel = getOrCreateLabel(PROCESSED_LABEL_NAME);

  threads.forEach(thread => {
    if (!threadHasLabel(thread, processedLabel)) {
      const messages = thread.getMessages();
      messages.forEach(message => {
        const attachments = message.getAttachments();
        attachments.forEach(attachment => {
          if (attachment.getContentType() === 'application/pdf') {
            const base64EncodedFile = Utilities.base64Encode(attachment.getBytes());

            const payload = {
              file: base64EncodedFile,
              filename: attachment.getName(),
              password: METROBANK_PASSWORD
            }
            const token = getIdToken();
            const options = {
              'method': 'post',
              'contentType': 'application/json',
              'payload': JSON.stringify(payload),
              'headers': { Authorization: `Bearer ${token}` },
            };
            const response = UrlFetchApp.fetch(CLOUD_FUNCTION_URL, options);
            const blob = response.getBlob();
            blob.setName('decrypted_' + payload.filename);

            const folder = DriveApp.getRootFolder();
            const file = folder.createFile(blob);
            Logger.log('File created: ' + file.getUrl());
          }
        })
      });
      // Mark the thread as processed by adding the label
      thread.addLabel(processedLabel);
    }
  });
}

function createJWT(header, payload, privateKey) {
  const headerBase64 = Utilities.base64EncodeWebSafe(JSON.stringify(header)).replace(/=+$/, '');
  const payloadBase64 = Utilities.base64EncodeWebSafe(JSON.stringify(payload)).replace(/=+$/, '');
  const signatureInput = `${headerBase64}.${payloadBase64}`;

  const signature = Utilities.computeRsaSha256Signature(signatureInput, privateKey);
  const signatureBase64 = Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');

  return `${signatureInput}.${signatureBase64}`;
}

function getIdToken() {
  const serviceAccountFile = DriveApp.getFileById(CREDENTIALS_FILE_ID);
  const serviceAccountContent = serviceAccountFile.getBlob().getDataAsString();
  const serviceAccount = JSON.parse(serviceAccountContent);

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(new Date().getTime() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://accounts.google.com/o/oauth2/token",
    iat: now,
    exp: now + 3600,
    target_audience: CLOUD_FUNCTION_URL
  };

  const jwt = createJWT(header, payload, serviceAccount.private_key);

  const tokenResponse = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      assertion: jwt,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
    }
  });

  const tokenData = JSON.parse(tokenResponse.getContentText());
  const idToken = tokenData.id_token;
  return idToken
}

function getOrCreateLabel(labelName) {
  const label = GmailApp.getUserLabelByName(labelName);
  return label ? label : GmailApp.createLabel(labelName);
}

function threadHasLabel(thread, label) {
  return thread.getLabels().some(l => l.getName() === label.getName());
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger('main')
    .timeBased()
    .after(1000)
    .create();

  ScriptApp.newTrigger('main')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}
