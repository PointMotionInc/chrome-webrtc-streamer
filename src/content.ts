import { GraphQLClient } from 'graphql-request';
import axios from 'axios';

let mediaRecorder: MediaRecorder | undefined;
let blob: Blob | undefined;
let uploadUrl: string;

// TODO: get GQL url from env variables.
let gqlClient = new GraphQLClient('https://api.dev.pointmotioncontrol.com/v1/graphql');

const port = chrome.runtime.connect({});
port.onMessage.addListener(async (request) => {
  if (request.event === 'start') {
    const { streamId } = request.data;
    if (!streamId) return;

    const accessToken = window.localStorage.getItem('accessToken');
    if (!accessToken) return;

    console.log('accessToken::', accessToken);

    // make gql req to get uploadUrl each time 'Start' is clicked.
    gqlClient.setHeader('Authorization', `Bearer ${accessToken}`);

    const query = `query UploadTestingVideo {
      uploadTestingVideoUrl {
        data {
          uploadUrl
        }
      }
    }`

    try {
      const resp = await gqlClient.request(query);
      uploadUrl = resp.uploadTestingVideoUrl.data.uploadUrl;
      console.log('uploadUrl:: ', uploadUrl);
    } catch (err) {
      console.error('upload url api failed::', err);
    }

    const streamOpts: any = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        },
      },
    };

    navigator.mediaDevices
      .getUserMedia(streamOpts)
      .then((stream) => {
        console.log('stream::', stream);
        mediaRecorder = createRecorder(stream, 'video/mp4');

        stream.getTracks().forEach((track) => {
          track.onended = () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          };
        });
      })
      .catch((err) => {
        console.log('err::', err);
      });
  }

  if (request.event === 'stop') {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }

  if (request.event === 'clear-memory') {
    if (blob) {
      URL.revokeObjectURL(blob as any);
    }
  }
});

function createRecorder(stream: MediaStream, mimeType: string) {
  let recordedChunks: BlobPart[] = [];
  const mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    console.log('stopping:mediaRecording::');
    saveFile(recordedChunks, mimeType);
    recordedChunks = [];
  };

  mediaRecorder.start(5000); // For every 'x'ms the stream data will be stored in a separate chunk.
  return mediaRecorder;
}

async function saveFile(recordedChunks: BlobPart[], mimeType: string) {
  blob = new Blob(recordedChunks, {
    type: mimeType,
  });

  try {
    await axios.put(uploadUrl, blob, {
      headers: {
        'Content-Type': mimeType
      }
    })
    console.log('file uploaded to s3');
  } catch (err) {
    console.error('uploading to S3 failed:: ', err);
  }

  port.postMessage({
    event: 'download',
    data: {
      url: URL.createObjectURL(blob),
    },
  });
}

console.log('Extension Script Injected.');
