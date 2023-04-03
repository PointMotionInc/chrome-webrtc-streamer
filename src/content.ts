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
let recordingStartedAt: Date;
let recordingEndedAt: Date;
let videoUploadObj: Upload;
let configUploadObj: Upload;
let gqlClient: GraphQLClient;

const graphqlUrls: {
  [key: string]: string;
} = {
  'patient.dev.pointmotioncontrol.com':
    'https://api.dev.pointmotioncontrol.com/v1/graphql',
  'patient.stage.pointmotioncontrol.com':
    'https://api.stage.pointmotioncontrol.com/v1/graphql',
  'patient.prod.pointmotioncontrol.com':
    'https://api.prod.pointmotioncontrol.com/v1/graphql',
  'app.pointmotion.us': 'https://api.prod.pointmotioncontrol.com/v1/graphql',
};

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

let accessToken: string | null;

const port = chrome.runtime.connect({});

port.onMessage.addListener(async (message: Message) => {
  // don't have to listen if the message is not for content-script
  if (message.to !== 'content') return;

  if (message.event === 'status') {
    accessToken = window.localStorage.getItem('accessToken');
    if (!accessToken) {
      status = 'no-token';
    }

    if (status === 'no-token') {
      if (accessToken) {
        status = 'ready';
      }
    }

    sendMessage('popup', 'status', { status });
  }

  if (message.event === 'start-recording') {
    recordingStartedAt = new Date();
    console.log('recordingStartedAt::', recordingStartedAt);
    const accessToken = window.localStorage.getItem('accessToken');
    const { streamId, deviceInfo, tabUrl } = message.data as any;
    console.log('tabUrl::', tabUrl);
    const url = new URL(tabUrl);
    gqlClient = new GraphQLClient(graphqlUrls[url.host]);

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
        window.alert(err.message);
        console.log('Unable To Get User Media::', err);
      });
  }

  if (message.event === 'stop-recording') {
    recordingEndedAt = new Date();
    console.log('recordingEndedAt::', recordingEndedAt);
    console.log('event::stop-recording::', message);
    if (mediaRecorder) {
      if (message.data) {
        downloadLocally = message.data.download;
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

  if (message.event === 'stop-uploading') {
    try {
      await stopUploading();

      status = 'ready';
      sendMessage('popup', 'status', { status });
    } catch (err) {
      console.error('stop uploading failed::', err);
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
    recordingEndedAt = new Date();
    console.log('recordingEndedAt::', recordingEndedAt);

    sendMessage('background', 'send-notification');

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
  const query = `mutation InsertUploadKeys($videoKey: String!, $configKey: String!, $endedAt: timestamptz!, $startedAt: timestamptz!) {
    insert_tester_videos_one(object: {videoKey: $videoKey, configKey: $configKey, endedAt: $endedAt, startedAt: $startedAt}) {
      id
    }
  }`;
  console.log('insertUploadKeys:recordingStartedAt::', recordingStartedAt);
  console.log('insertUploadKeys:recordingEndedAt::', recordingEndedAt);
  await gqlClient.request(query, {
    videoKey,
    configKey,
    startedAt: recordingStartedAt.toISOString(),
    endedAt: recordingEndedAt.toISOString(),
  });
}

async function stopUploading() {
  try {
    videoUploadObj.abort();
    configUploadObj.abort();
  } catch (err) {
    console.error('error while aborting S3 uploads:: ', err);
  }
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
    configUploadObj = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Bucket,
        Key: configKey,
        Body: sysInfoFileBlob,
        ContentType: 'application/json; charset=utf-8',
      },
    });
    await configUploadObj.done();
    console.log('config file uploaded success');

    const videoKey = `${s3Folder}/video.mp4`;
    videoUploadObj = new Upload({
      client: s3Client,
      params: {
        ContentType: 'video/mp4',
        Bucket: s3Bucket,
        Key: videoKey,
        Body: blob,
      },
    });

    videoUploadObj.on('httpUploadProgress', (progress) => {
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

    await videoUploadObj.done();
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
