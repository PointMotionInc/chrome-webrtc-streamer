const start = document.getElementById('start');
const stop = document.getElementById('stop');
const data = document.getElementById('data');

data.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    event: 'device-info',
  });
});

start.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    event: 'start-recording',
  });
});

stop.addEventListener('click', () => {
  chrome.runtime.sendMessage({
    event: 'stop-recording',
  });
});

// let stream = await recordScreen();
// let audio = await recordAudio();
// let combine = new MediaStream([...stream.getTracks(), ...audio.getTracks()]);
// let mimeType = 'video/mp4';
// mediaRecorder = createRecorder(combine, mimeType);
