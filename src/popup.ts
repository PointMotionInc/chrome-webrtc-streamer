import './../public/popup/popup.scss';
import { sendMessage } from './helper';

const status: Status = 'no-token';

const content: { [key in Status]: string } = {
  'no-token': `
        <div class="col-12 mt-1 heading-text">
            Please sign in to Sound Health to start recording.
        </div>
        <div class="col-12 flex-center mt-3">
          <button id='start' class="btn btn-primary custom-btn" disabled>Start Recording</button>
        </div>
        <div class="col-12 flex-center mt-2 mb-1">
          <button class="btn btn-outline-primary custom-btn" disabled>View Previous Recordings</button>
        </div>`,

  ready: `
        <div class="col-12 mt-1 heading-text">
            Start new recording or view previous recordings.
        </div>
        <div class="col-12 flex-center mt-3">
          <button id='start' class="btn btn-primary custom-btn">Start Recording</button>
        </div>
        <div class="col-12 flex-center mt-2 mb-1">
          <button id='previous-recordings' class="btn btn-outline-primary custom-btn">View Previous Recordings</button>
        </div>`,

  recording: `
        <div class="col-12 mt-1 heading-text">
          Recording in progress.
        </div>
        <div class="col-12 mx-auto mt-1">
          <div class="row w-full">
            <div class="col-6 p-0 m-0">
              <label for="download" class="custom-form-label cursor-pointer">Download local copy</label>
            </div>
            <div class="col-6 d-flex align-items-center justify-content-end">
              <input class="form-check-input" type="checkbox" name="download" id="download">
            </div>
          </div>
        </div>
        <div class="col-12 mt-2 mb-1 flex-center">
          <button id="stop" class="btn btn-outline-danger custom-btn">Stop Recording</button>
        </div>`,

  'recording-complete': `
        <div class="col-12 mt-1 heading-text">
          Your recording is complete.
        </div>
        <div class="col-12 flex-center mt-3">
          <button id='upload' class="btn btn-primary custom-btn">Upload recording</button>
        </div>
        <div class="col-12 flex-center mt-2 mb-1">
          <button id='delete' class="btn btn-outline-danger custom-btn">Delete Recording</button>
        </div>`,

  uploading: `
      <div class="col-12 mt-1 heading-text">
        Uploading your recording.
      </div>
      <div class="col-12 mt-2 note-text">
        Your recording is being uploaded to Sound Health. This process might take a few minutes.
      </div>
      <div class="col-12 mt-3 row">
        <div id='progress-text' class="col-2 progress-text">
          0%
        </div>
        <div class="col-10 progress-div">
          <div class="progress">
            <div id="progress-bar" class="progress-bar bg-success" role="progressbar"
              aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
          </div>
        </div>
      </div>
      <hr class="mt-3 d-none">
      <div class="col-12 flex-center mt-1 mb-1 d-none">
        <button id='stop-uploading' class="btn btn-outline-danger custom-btn">Stop Uploading</button>
      </div>`,

  'uploading-complete': `
      <div class="col-12 d-flex justify-content-center">
        <i class="bi bi-check-circle-fill text-success success-icon"></i>
      </div>
      <div class="col-12 heading-text flex-center mt-1">
        Recording successfully uploaded.
      </div>
      <div class="col-12 note-text flex-center mt-1">
        Thank you for sharing your experience with us.
      </div>
      <div class="col-12 flex-center mt-2">
        <button id='start' class="btn btn-primary custom-btn">Start Recording</button>
      </div>
      <div class="col-12 flex-center mt-2 mb-1">
        <button id='previous-recordings' class="btn btn-outline-primary custom-btn">View Previous Recordings</button>
      </div>`,
};

const updateHtml = (status: Status) => {
  document.getElementById('content')!.innerHTML = content[status];

  if (status === 'no-token') {
    const signInBtn = document.getElementById('signin')!;
    signInBtn.classList.remove('d-none');

    signInBtn.addEventListener('click', () => {
      sendMessage('background', 'signin');
    });
  } else if (status === 'ready' || status === 'uploading-complete') {
    const start = document.getElementById('start')!;
    start.addEventListener('click', () => {
      sendMessage('background', 'start-recording');
    });
    const previousRecordings = document.getElementById('previous-recordings')!;
    previousRecordings.addEventListener('click', () => {
      sendMessage('background', 'previous-recordings');
    });
  } else if (status === 'recording') {
    const stop = document.getElementById('stop')!;
    stop.addEventListener('click', () => {
      const download = document.getElementById('download')! as HTMLInputElement;
      sendMessage('content', 'stop-recording', { download: download.checked });
    });
  } else if (status === 'recording-complete') {
    const uploadBtn = document.getElementById('upload')!;
    const deleteBtn = document.getElementById('delete')!;
    uploadBtn.addEventListener('click', () => {
      sendMessage('content', 'upload-recording');
    });
    deleteBtn.addEventListener('click', () => {
      sendMessage('content', 'delete-recording');
    });
  }
};

// popup state is not persistent, so we have to get the status from content script
// we're getting status from content-script everytime the popup is opened.
chrome.runtime.sendMessage<Message, Message>(
  {
    to: 'content',
    event: 'status',
  },
  (message) => {
    if (message.data && message.data.status) {
      updateHtml(message.data.status as Status);
    }
  }
);

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // don't have to listen to message if it's not for popup
    if (message.to !== 'popup') return;

    if (message.event === 'status') {
      if (message.data && message.data.status) {
        updateHtml(message.data.status as Status);
      }
    }

    if (message.event === 'uploading-progresss') {
      if (message.data && message.data.progress) {
        const { progress } = message.data;

        document.getElementById('content')!.innerHTML = content['uploading'];

        // setting progress text and progress bar width
        const progressText = document.getElementById('progress-text')!;
        progressText.innerHTML = `${progress}%`;

        const progressBar = document.getElementById('progress-bar')!;
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', `${progress}`);
      }
    }
  }
);
