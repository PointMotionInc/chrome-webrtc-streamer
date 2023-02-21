import { GraphQLClient } from 'graphql-request';
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';

let mediaRecorder: MediaRecorder | undefined;
let blob: Blob | undefined;
let stsCreds: any;
let s3Folder: string;
let s3Bucket: string;
let sysDeviceInfo: Partial<DeviceInfo> = {};
let downloadLocally = false;

let status: Status = 'no-token';

const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)');
if (darkModePreference.matches) {
  console.log('change icon to light');
  chrome.runtime.sendMessage({ icon: 'light' });
}
darkModePreference.addEventListener('change', (event) => {
  if (event.matches) {
    chrome.runtime.sendMessage({ icon: 'light' });
  } else {
    chrome.runtime.sendMessage({ icon: 'dark' });
  }
});

const sendMessage = (
  to: 'background' | 'content' | 'popup',
  event: string,
  data?: { [key: string]: any }
) => {
  if (port) {
    port.postMessage({
      to,
      event,
      data,
    });
  } else {
    console.error('Port is undefined');
  }
};

// TODO: make URL change acc to the tab it runs on.
const gqlClient = new GraphQLClient(
  'https://api.dev.pointmotioncontrol.com/v1/graphql'
);

const accessToken = window.localStorage.getItem('accessToken');
if (accessToken) {
  status = 'ready';
}

const port = chrome.runtime.connect({});
port.onMessage.addListener(async (message: Message) => {
  // don't have to listen if the message is not for content-script
  if (message.to !== 'content') return;

  if (message.event === 'status') {
    sendMessage('popup', 'status', { status });
  }

  if (message.event === 'start-recording') {
    const { streamId, deviceInfo } = message.data as any;
    if (!streamId) return;

    if (deviceInfo) {
      sysDeviceInfo = deviceInfo;
    } else {
      console.error('Could not read system device information!');
    }

    gqlClient.setHeader('Authorization', `Bearer ${accessToken}`);

    const query = `query UploadTestingVideoSts {
      uploadTestingVideoSts {
        data {
          credentials {
            accessKeyId: AccessKeyId
            secretAccessKey: SecretAccessKey
            sessionToken: SessionToken
          }
          folder
          bucket
        }
      }
    }`;

    try {
      const resp = await gqlClient.request(query);
      stsCreds = resp.uploadTestingVideoSts.data.credentials;
      s3Folder = resp.uploadTestingVideoSts.data.folder;
      s3Bucket = resp.uploadTestingVideoSts.data.bucket;
    } catch (err) {
      console.error('sts api failed ::', err);
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
        status = 'recording';
        sendMessage('popup', 'status', { status });

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
        console.log('Unable To Get User Media::', err);
      });
  }

  if (message.event === 'stop-recording') {
    console.log('event::stop-recording::', message);
    if (mediaRecorder) {
      if (message.data && message.data.download) {
        downloadLocally = true;
      }

      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }

  if (message.event === 'upload-recording') {
    if (blob) {
      uploadFile(blob);
    }
    status = 'uploading';
    sendMessage('popup', 'status', { status });
  }

  if (message.event === 'delete-recording') {
    if (blob) {
      URL.revokeObjectURL(blob as any);
    }
    status = 'ready';
    sendMessage('popup', 'status', { status });
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

    blob = new Blob(recordedChunks, {
      type: mimeType,
    });

    if (downloadLocally) {
      sendMessage('background', 'download', {
        url: URL.createObjectURL(blob),
      });
    }
    recordedChunks = [];

    status = 'recording-complete';
    sendMessage('popup', 'status', { status });
  };

  mediaRecorder.start(5000); // For every 'x'ms the stream data will be stored in a separate chunk.
  return mediaRecorder;
}

async function insertUploadKeys(videoKey: string, configKey: string) {
  const query = `mutation InsertUploadKeys($videoKey: String!, $configKey: String!) {
    insert_tester_videos_one(object: {videoKey: $videoKey, configKey: $configKey}) {
      id
    }
  }`;
  await gqlClient.request(query, { videoKey, configKey });
}

async function uploadFile(blob: Blob) {
  try {
    const s3Client = new S3({
      credentials: { ...stsCreds },
      region: 'us-east-1',
    });

    // uploading system config file
    const str = JSON.stringify(sysDeviceInfo);
    const bytes = new TextEncoder().encode(str);
    const sysInfoFileBlob = new Blob([bytes], {
      type: 'application/json;charset=utf-8',
    });
    const configKey = `${s3Folder}/config.json`;
    const uploadSystemConfig = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Bucket,
        Key: configKey,
        Body: sysInfoFileBlob,
        ContentType: 'application/json; charset=utf-8',
      },
    });
    await uploadSystemConfig.done();
    console.log('config file uploaded success');

    const videoKey = `${s3Folder}/video.mp4`;
    const parallelUploads3 = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Bucket,
        Key: videoKey,
        Body: blob,
      },
    });

    parallelUploads3.on('httpUploadProgress', (progress) => {
      // NOTE: can use 'progress' data to show a progress bar.
      console.log('upload progress::', progress);

      if (progress.loaded && progress.total) {
        const progressPercent = Math.round(
          (progress.loaded / progress.total) * 100
        );

        // send progress event
        sendMessage('popup', 'uploading-progresss', {
          progress: progressPercent,
        });
      }
    });

    await parallelUploads3.done();
    await insertUploadKeys(videoKey, configKey);

    // removing blob when download is complete
    if (blob) {
      URL.revokeObjectURL(blob as any);
    }

    status = 'uploading-complete';
    sendMessage('popup', 'status', { status });
    console.log('file uploaded to S3 success');
  } catch (err) {
    console.error('Uploading to S3 failed:: ', err);
  }
}

console.log('Extension Script Injected.');
